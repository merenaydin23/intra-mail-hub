async function testLitterbox() {
    const formData = new FormData();
    const dummyContent = new Uint8Array(1024 * 1024);
    const blob = new Blob([dummyContent], { type: 'application/pdf' });
    
    formData.append('reqtype', 'fileupload');
    formData.append('time', '72h');
    formData.append('fileToUpload', blob, 'test.pdf');
    
    try {
        const res = await fetch('https://litterbox.catbox.moe/api', {
            method: 'POST',
            body: formData
        });
        const text = await res.text();
        console.log("Status:", res.status);
        console.log("Response:", text);
    } catch (e) {
        console.error("Error:", e);
    }
}
testLitterbox();
