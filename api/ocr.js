// api/ocr.js (Enhanced Vercel Version)
const Tesseract = require('tesseract.js');
const { createWorker } = Tesseract;

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const formData = await parseFormData(req);
    const imageFile = formData.files.image;
    const language = formData.fields.language || 'eng';
    const mode = formData.fields.mode || 'fast';

    if (!imageFile) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Enhanced preprocessing
    const processedImage = await preprocessImage(imageFile.buffer);
    
    // Smart OCR configuration based on mode
    const workerConfig = getWorkerConfig(mode, language);
    
    const worker = await createWorker();
    
    try {
      await worker.loadLanguage(language);
      await worker.initialize(language);
      await worker.setParameters(workerConfig);

      const { data: { text, confidence, lines } } = await worker.recognize(processedImage);

      // Post-processing for better results
      const processedText = postProcessText(text, language);
      
      res.json({
        text: processedText,
        confidence: confidence,
        engine: 'smart-tesseract',
        language: language,
        mode: mode,
        lines: lines?.length || 0
      });
    } finally {
      await worker.terminate();
    }

  } catch (error) {
    console.error('OCR processing error:', error);
    res.status(500).json({ 
      error: 'OCR processing failed',
      details: error.message 
    });
  }
};

// Enhanced preprocessing function
async function preprocessImage(buffer) {
  // In a real implementation, you'd use sharp or canvas for image processing
  // For Vercel, we return the buffer as-is due to limitations
  return buffer;
}

// Smart configuration based on mode and language
function getWorkerConfig(mode, language) {
  const baseConfig = {
    tessedit_pageseg_mode: '6', // Uniform block of text
    tessedit_ocr_engine_mode: '1', // Neural nets LSTM engine
    preserve_interword_spaces: '1',
    tessedit_create_hocr: '0',
    tessedit_create_tsv: '0',
    tessedit_create_boxfile: '0'
  };

  const modeConfigs = {
    'fast': {
      tessedit_pageseg_mode: '6',
      tessedit_ocr_engine_mode: '1'
    },
    'advanced': {
      tessedit_pageseg_mode: '3', // Fully automatic page segmentation
      tessedit_ocr_engine_mode: '1',
      textord_min_linesize: '2.5',
      textord_old_baselines: '0'
    },
    'handwriting': {
      tessedit_pageseg_mode: '6', // Uniform block
      tessedit_ocr_engine_mode: '1',
      textord_min_linesize: '2.0',
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?\'"-'
    }
  };

  // Language-specific optimizations
  const languageConfigs = {
    'lav': { // Latvian
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzĀāČčĒēĢģĪīĶķĻļŅņŠšŪūŽž0123456789 .,!?\'"-'
    },
    'rus': { // Russian
      tessedit_char_whitelist: 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя0123456789 .,!?\'"-'
    }
  };

  return {
    ...baseConfig,
    ...modeConfigs[mode],
    ...languageConfigs[language]
  };
}

// Enhanced text post-processing
function postProcessText(text, language) {
  let processed = text;
  
  // Remove excessive line breaks but preserve paragraphs
  processed = processed.replace(/\n{3,}/g, '\n\n');
  
  // Fix common OCR errors
  processed = processed.replace(/[lI]/g, 'I'); // Fix I/l confusion
  processed = processed.replace(/rn/g, 'm'); // Fix rn -> m
  processed = processed.replace(/cl/g, 'd'); // Fix cl -> d
  
  // Language-specific corrections
  if (language === 'lav') {
    processed = applyLatvianCorrections(processed);
  }
  
  return processed.trim();
}

function applyLatvianCorrections(text) {
  const corrections = {
    'ā': 'a', 'č': 'c', 'ē': 'e', 'ģ': 'g', 'ī': 'i',
    'ķ': 'k', 'ļ': 'l', 'ņ': 'n', 'š': 's', 'ū': 'u', 'ž': 'z'
  };
  
  return text.split('').map(char => corrections[char] || char).join('');
}

// Form data parsing (keep your existing implementation)
async function parseFormData(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let fields = {};
    let files = {};

    req.on('data', chunk => chunks.push(chunk));
    
    req.on('end', () => {
      try {
        const data = Buffer.concat(chunks);
        const boundary = req.headers['content-type']?.split('boundary=')[1];
        
        if (!boundary) {
          reject(new Error('No boundary found'));
          return;
        }

        const parts = data.split(`--${boundary}`);
        
        for (const part of parts) {
          if (part.includes('Content-Disposition')) {
            const nameMatch = part.match(/name="([^"]+)"/);
            if (nameMatch) {
              const name = nameMatch[1];
              const value = part.split('\r\n\r\n')[1];
              
              if (part.includes('filename="')) {
                const filenameMatch = part.match(/filename="([^"]+)"/);
                const contentTypeMatch = part.match(/Content-Type: ([^\r\n]+)/);
                
                files[name] = {
                  filename: filenameMatch ? filenameMatch[1] : 'unknown',
                  type: contentTypeMatch ? contentTypeMatch[1] : 'application/octet-stream',
                  buffer: Buffer.from(value?.trim() || '')
                };
              } else {
                fields[name] = value?.trim();
              }
            }
          }
        }
        
        resolve({ fields, files });
      } catch (error) {
        reject(error);
      }
    });
    
    req.on('error', reject);
  });
}
