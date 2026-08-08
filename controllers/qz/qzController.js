const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CERT_PATH = path.join(__dirname, '../../certs/qz/digital-certificate.pem');
const KEY_PATH = path.join(__dirname, '../../certs/qz/private-key.pem');

// Serves the public certificate QZ Tray uses to identify this app as a known,
// trusted source — lets the seller dashboard connect without QZ Tray showing
// an "untrusted/anonymous request" warning on every print.
exports.getCertificate = (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(fs.readFileSync(CERT_PATH, 'utf8'));
};

// Signs the challenge QZ Tray sends so it can verify the request really came
// from this app (matching the certificate above), not an impostor site.
exports.sign = (req, res) => {
  try {
    const { request } = req.body;
    const privateKey = fs.readFileSync(KEY_PATH, 'utf8');
    const signature = crypto
      .createSign('RSA-SHA512')
      .update(request || '')
      .sign(privateKey, 'base64');
    res.status(200).json({ success: true, signature });
  } catch (error) {
    console.error('QZ signing error:', error);
    res.status(500).json({ success: false, message: 'Failed to sign QZ Tray request' });
  }
};
