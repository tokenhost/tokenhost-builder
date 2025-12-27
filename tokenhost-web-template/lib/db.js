
import { Web3Storage } from 'web3.storage';

function getStorageClient() {
  const token = process.env.NEXT_PUBLIC_WEB3_STORAGE_TOKEN;
  if (!token) {
    throw new Error('Missing NEXT_PUBLIC_WEB3_STORAGE_TOKEN.');
  }
  return new Web3Storage({ token });
}

async function put(image) {
	const uploadFileName = `${image.name}`;
	const client = getStorageClient();
	const rootCid = await client.put([image], {
	  name: uploadFileName,
	  maxRetries: 3
	});
	const res = await client.get(rootCid); // Web3Response
	const files = await res.files(); // Web3File[]
	for (const file of files) {
	  console.log(`${file.cid} ${file.name} ${file.size}`);
		return `https://${file.cid}.ipfs.dweb.link/`;
	}


}


export {
  put,
}
