// /api/upload-to-pinata.js (Vercel API Route)
import { PinataSDK } from "pinata";
import formidable from 'formidable';
import fs from 'fs';

const pinata = new PinataSDK({
    pinataJwt: process.env.PINATA_JWT,       
    pinataGateway: process.env.PINATA_GATEWAY 
});

export const config = {
    api: {
        bodyParser: false, // Disable body parsing for file uploads
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Parse the form data
        const form = formidable({
            maxFileSize: 10 * 1024 * 1024, // 10MB limit
        });

        const [fields, files] = await form.parse(req);
        
        if (!files.file || !files.file[0]) {
            return res.status(400).json({ error: 'No file provided' });
        }

        const file = files.file[0];
        
        // Create a readable stream from the file
        const fileStream = fs.createReadStream(file.filepath);
        const fileName = file.originalFilename || 'unnamed-file';

        // Upload to Pinata
        const upload = await pinata.upload.stream(fileStream, {
            metadata: {
                name: fileName,
                keyvalues: fields.metadata ? JSON.parse(fields.metadata[0]) : {}
            }
        });

        // Clean up temporary file
        fs.unlinkSync(file.filepath);

        res.status(200).json({
            success: true,
            ipfsHash: upload.IpfsHash,
            pinataUrl: `https://gateway.pinata.cloud/ipfs/${upload.IpfsHash}`,
            size: upload.PinSize,
            timestamp: upload.Timestamp
        });

    } catch (error) {
        console.error("Pinata upload error:", error);
        res.status(500).json({ 
            error: 'Upload failed', 
            details: error.message 
        });
    }
}

