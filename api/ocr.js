const Tesseract = require('tesseract.js');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse multipart form data
    const formData = await parseFormData(req);
    const imageFile = formData.files.image;
    const language = formData.fields.language || 'eng';
    const mode = formData.fields.mode || 'fast';

    if (!imageFile) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Convert buffer to base64
    const base64Image = imageFile.buffer.toString('base64');
    const imageData = `data:${imageFile.type};base64,${base64Image}`;

    // Configure Tesseract based on mode
    const workerConfig = {
      logger: m => console.log(m),
    };

    if (mode === 'handwriting') {
      workerConfig.psm = 6; // Uniform block of text
    } else if (mode === 'advanced') {
      workerConfig.psm = 3; // Fully automatic page segmentation
    } else {
      workerConfig.psm = 3; // Fast mode
    }

    const { data: { text, confidence } } = await Tesseract.recognize(imageData, language, workerConfig);

    res.json({
      text: text,
      confidence: confidence,
      engine: 'cloud',
      language: language,
      mode: mode
    });

  } catch (error) {
    console.error('OCR processing error:', error);
    res.status(500).json({ 
      error: 'OCR processing failed',
      details: error.message 
    });
  }
};

// Helper function to parse multipart form data
function parseFormData(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let fields = {};
    let files = {};

    req.on('data', chunk => chunks.push(chunk));
    
    req.on('end', () => {
      const data = Buffer.concat(chunks);
      const boundary = req.headers['content-type'].split('boundary=')[1];
      
      if (!boundary) {
        reject(new Error('No boundary found in Content-Type'));
        return;
      }

      const parts = data.split(`--${boundary}`);
      
      for (const part of parts) {
        if (part.includes('Content-Disposition')) {
          const match = part.match(/name="([^"]+)"/);
          if (match) {
            const name = match[1];
            const value = part.split('\r\n\r\n')[1];
            
            if (part.includes('filename="')) {
              // It's a file
              const filenameMatch = part.match(/filename="([^"]+)"/);
              const contentTypeMatch = part.match(/Content-Type: ([^\r\n]+)/);
              
              files[name] = {
                filename: filenameMatch ? filenameMatch[1] : 'unknown',
                type: contentTypeMatch ? contentTypeMatch[1] : 'application/octet-stream',
                buffer: Buffer.from(value.trim())
              };
            } else {
              // It's a field
              fields[name] = value.trim();
            }
          }
        }
      }
      
      resolve({ fields, files });
    });
    
    req.on('error', reject);
  });
}