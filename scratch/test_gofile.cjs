async function testGofile() {
    try {
        const serverRes = await fetch('https://api.gofile.io/servers');
        const serverJson = await serverRes.json();
        const server = serverJson.data.servers[0].name;
        
        const formData = new FormData();
        const dummyContent = new Uint8Array(1024 * 1024);
        const blob = new Blob([dummyContent], { type: 'application/pdf' });
        formData.append('file', blob, 'test.pdf');
        
        const res = await fetch(`https://${server}.gofile.io/contents/uploadfile`, {
            method: 'POST',
            body: formData
        });
        const json = await res.json();
        console.log("Status:", res.status);
        console.log("Response:", JSON.stringify(json, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
}
testGofile();
