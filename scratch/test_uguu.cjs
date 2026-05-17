const fs = require('fs');

async function testUpload() {
    const formData = new FormData();
    // Create a dummy 1MB PDF file in memory
    const dummyContent = new Uint8Array(1024 * 1024);
    const blob = new Blob([dummyContent], { type: 'application/pdf' });
    formData.append('files[]', blob, 'test.pdf');
    
    try {
        const res = await fetch('https://uguu.se/api.php?d=upload-tool', {
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

testUpload();
