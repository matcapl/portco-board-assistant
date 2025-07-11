const { unlink } = require('fs').promises;
const multer = require('multer');
const xlsx = require('xlsx');

const upload = multer({
  dest: '/tmp',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    console.log('File received:', {
      originalname: file ? file.originalname : 'null',
      mimetype: file ? file.mimetype : 'null',
      size: file ? file.size : 'null'
    });
    if (!file) {
      console.error('No file provided in request');
      return cb(new Error('No file provided'));
    }
    if (!file.originalname.match(/\.(xlsx|xls)$/)) {
      console.error('Invalid file extension:', file.originalname);
      return cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
    if (file.mimetype !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      console.error('Invalid MIME type:', file.mimetype);
      return cb(new Error('Invalid MIME type for Excel file'));
    }
    cb(null, true);
  },
}).single('file');

const checklist = require('../public/checklist.json');

module.exports = async (req, res) => {
  console.log('Received request to /api/analyze:', {
    method: req.method,
    headers: req.headers,
    contentType: req.headers['content-type'] || 'undefined'
  });

  // Log raw body for debugging
  let rawBody = '';
  req.on('data', chunk => {
    rawBody += chunk.toString();
  });
  req.on('end', () => {
    console.log('Raw request body:', rawBody.length > 0 ? rawBody.substring(0, 500) + '...' : 'empty');
  });

  upload(req, res, async (err) => {
    if (err) {
      console.error('Multer error:', err.message, err.stack);
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      console.error('No file uploaded');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('Processing file:', {
      path: req.file.path,
      originalname: req.file.originalname,
      size: req.file.size
    });

    let workbook;
    try {
      workbook = xlsx.readFile(req.file.path, { cellText: false, cellDates: true });
      console.log('Workbook sheets:', Object.keys(workbook.Sheets));
    } catch (error) {
      console.error('Excel parsing error:', error.message, error.stack);
      await unlink(req.file.path).catch(e => console.error('Failed to delete file:', e.message));
      return res.status(400).json({ error: 'Invalid Excel file format: ' + error.message });
    }

    const data = {};
    checklist.metrics.forEach(metric => {
      const sheet = workbook.Sheets[metric.data_source.sheet];
      if (!sheet) {
        console.log(`Sheet ${metric.data_source.sheet} not found`);
        return;
      }

      const actualCell = sheet[metric.data_source.actual.cell];
      const budgetCell = sheet[metric.data_source.budget.cell];
      data[metric.name] = {
        actual: actualCell && typeof actualCell.v === 'number' ? actualCell.v : null,
        budget: budgetCell && typeof budgetCell.v === 'number' ? budgetCell.v : null,
      };
      console.log(`Metric ${metric.name}:`, data[metric.name]);
    });

    const results = checklist.metrics
      .map(metric => {
        const { actual, budget } = data[metric.name] || {};
        if (actual === null || budget === null) {
          console.log(`Invalid data for ${metric.name}: actual=${actual}, budget=${budget}`);
          return null;
        }

        const deviation = Math.abs(actual - budget) / budget * 100;
        const priorityScore = (deviation / metric.threshold) * metric.weight;

        let type, text;
        if (deviation > metric.threshold) {
          type = 'question';
          text = metric.question_template
            .replace('{current_value}', actual)
            .replace('{budgeted_value}', budget);
        } else {
          type = 'observation';
          text = `The ${metric.name} is ${actual}, within ${deviation.toFixed(1)}% of the budgeted ${budget}.`;
        }

        return { type, text, priorityScore };
      })
      .filter(item => item !== null);

    results.sort((a, b) => b.priorityScore - a.priorityScore);

    console.log('Analysis results:', results);

    try {
      await unlink(req.file.path);
      console.log('File deleted:', req.file.path);
    } catch (e) {
      console.error('Failed to delete file:', e.message);
    }

    console.log('Sending response:', { results, files: [req.file.originalname] });
    return res.status(200).json({ results, files: [req.file.originalname] });
  });
};