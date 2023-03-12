
import { Web3Storage } from 'web3.storage';

// Construct with token and endpoint
const client = new Web3Storage({ token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWQ6ZXRocjoweGNGMzkzY0FGMDE5QTMwNTRhNTc3NTg2MWVhOTY2M2RGRGYzYzkzNjciLCJpc3MiOiJ3ZWIzLXN0b3JhZ2UiLCJpYXQiOjE2Nzg1Njg4OTE4MjIsIm5hbWUiOiJNaWtlIn0.rlvOh9vfPZhQso8aBh17S90xv0rP3POvKgfgl0ZrJhc" }); //todo let people add their own token here

async function put(image) {
	const uploadFileName = `${image.name}`;
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
