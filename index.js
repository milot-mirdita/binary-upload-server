require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();

const allowed_signers = process.env.SIGNERS_FILE;
const multer_storage = process.env.MULTER_TEMP;
const upload_path = process.env.UPLOAD_PATH;
const express_port = process.env.EXPRESS_PORT;
if (!fs.existsSync(allowed_signers)) {
    console.error(`Signers file not found: ${allowed_signers}`);
    process.exit(1);
}
fs.mkdirSync(multer_storage, { recursive: true });
fs.mkdirSync(upload_path, { recursive: true });

const upload = multer({ dest: multer_storage });

app.post('/api/upload', upload.fields([{ name: 'file[]', maxCount: 10 }, { name: 'signature[]', maxCount: 10 }]), (req, res) => {
    const files = req.files['file[]'];
    const signatures = req.files['signature[]'];

    if (!files || !signatures) {
        cleanup(files, signatures);
        return res.status(400).json({ error: 'Both files and signatures are required' });
    }

    if (!/^[A-Za-z0-9_\-@\.]+$/.test(req.body.identifier)) {
        return res.status(400).json({ error: 'Invalid identifier' });
    }
    
    if (!/^[A-Za-z0-9]+$/i.test(req.body.directory)) {
        return res.status(400).json({ error: 'Invalid directory' });
    }

    const identifier = req.body.identifier;
    const directory = path.join(upload_path, req.body.directory);

    if (files.length !== signatures.length) {
        cleanup(files, signatures);
        return res.status(400).json({ error: 'Mismatch between number of files and signatures' });
    }

    verifyFiles(files, signatures, identifier, (error) => {
        if (error) {
            console.error(error);
            cleanup(files, signatures);
            return res.status(500).json({ error: 'Error verifying file signature' });
        }

        try {
            moveFiles(files, directory);
        } catch (error) {
            console.error(error);
            cleanup(files, signatures);
            return res.status(500).json({ error: 'Failed to move files' });
        }

        cleanup(files, signatures);

        const base = path.resolve(upload_path, '..');
        const link = path.join(base, identifier);
        if (fs.existsSync(link)) {
            fs.unlinkSync(link);
        }
        fs.symlinkSync(directory, link);

        return res.json({ status: 'OK' });
    });
});

function cleanup(files, signatures) {
    if (files) {
        files.forEach(file => {
            if (fs.existsSync(file.path))
                fs.unlinkSync(file.path)
        });
    }
    if (signatures) {
        signatures.forEach(signature => {
            if (fs.existsSync(signature.path))
                fs.unlinkSync(signature.path)
        });
    }
}

function verifyFiles(files, signatures, identifier, callback) {
    let pending = files.length;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const signature = signatures[i];

        const child = execFile('ssh-keygen', ['-Y', 'verify', '-f', allowed_signers, '-n', 'file', '-s', signature.path, '-I', identifier], (err, stdout, stderr) => {
            if (err) {
                console.error(err);
                callback(err);
                return;
            }
            // console.log(`stdout: ${stdout}`);
            if (--pending === 0) callback(null);
        });

        const fileStream = fs.createReadStream(file.path);
        fileStream.pipe(child.stdin);
    }
}

function moveFiles(files, directory) {
    const dirPath = path.join(directory);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }

    files.forEach((file, _) => {
        const targetPath = path.join(directory, file.originalname);
        fs.renameSync(file.path, targetPath);

        if (!fs.existsSync(targetPath)) {
            throw new Error(`Failed to move file: ${file.path}`);
        }
    });
}

app.listen(express_port, () => console.log(`Server started on port ${express_port}`));
