import pkg from "basic-ftp";
const { Client } = pkg;
import sanitize from "sanitize-filename";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { Readable } from "stream";

export async function uploadToFTP(file) {
  const client = new Client();

  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USERNAME,
      password: process.env.FTP_PASSWORD,
      secure: false,
    });

    // extension
    const ext = path.extname(file.originalname).toLowerCase();
    
    // unique filename
    const safename = sanitize(path.basename(file.originalname, ext)).replace(/\s+/g, "-").toLowerCase();
    const filename = `${safename}-${uuidv4()}${ext}`;

    // move into target directory
    // await client.ensureDir("/public_html/tjc.me/jw-search-assets");

    // convert buffer to stream
    const stream = Readable.from(file.buffer);

    // upload
    await client.uploadFrom(stream, filename);

    // optional public URL
    const publicUrl = `https://tjc.me/jw-search-assets/${filename}`;

    return {
      filename,
      publicUrl,
    };
  } catch (err) {
    console.error("FTP Upload Error:", err);
    throw err;
  } finally {
    client.close();
  }
}
