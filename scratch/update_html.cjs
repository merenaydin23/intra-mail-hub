const fs = require('fs');
const path = require('path');

const files = ['bolge.html', 'fabrika.html', 'yerel.html', 'calisan.html'];
const injection = `
          <div class="form-group">
            <label><i class="fa-solid fa-clock"></i> Zamanlı Gönderim - <i>Opsiyonel</i></label>
            <input type="datetime-local" id="scheduledTimeInput" style="padding:0.75rem; width:100%; border:1px solid var(--border); border-radius:10px; outline:none;" />
          </div>
          <div class="form-group">
            <label><i class="fa-solid fa-paperclip"></i> Dosya (PDF, Resim) Ekle - <i>Opsiyonel</i></label>
`;

for (const file of files) {
    const p = path.join('c:/Users/HP/Desktop/intra-mail-hub-main/web/pages/portals', file);
    if (!fs.existsSync(p)) continue;
    let content = fs.readFileSync(p, 'utf-8');
    content = content.replace(/<div class="form-group">\s*<label><i class="fa-solid fa-paperclip"><\/i> Dosya \(PDF, Resim\) Ekle - <i>Opsiyonel<\/i><\/label>/, injection.trim());
    fs.writeFileSync(p, content);
    console.log("Updated", file);
}
