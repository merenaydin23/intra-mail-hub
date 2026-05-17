async function testPomf() {
    const formData = new FormData();
    const dummyContent = new Uint8Array(1024 * 1024);
    const blob = new Blob([dummyContent], { type: 'application/pdf' });
    formData.append('files[]', blob, 'test.pdf');
    
    try {
        const res = await fetch('https://pomf.lain.la/upload.php', {
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
testPomf();
