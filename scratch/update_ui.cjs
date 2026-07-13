const fs = require('fs');
const path = require('path');

const files = ['bolge.html', 'fabrika.html', 'yerel.html', 'calisan.html'];

const quickButtons = `
          <div class="form-group scheduled-options-group">
            <label><i class="fa-solid fa-clock"></i> Zamanlı Gönderim (İsteğe Bağlı)</label>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.5rem;" id="quickTimeButtons">
               <button type="button" class="btn-action quick-time-btn" data-time="tomorrow_08" style="padding:0.4rem 0.8rem; border-radius:6px; cursor:pointer;">Yarın 08:00</button>
               <button type="button" class="btn-action quick-time-btn" data-time="tomorrow_12" style="padding:0.4rem 0.8rem; border-radius:6px; cursor:pointer;">Yarın 12:00</button>
               <button type="button" class="btn-action quick-time-btn" data-time="today_17" style="padding:0.4rem 0.8rem; border-radius:6px; cursor:pointer;">Bugün 17:00</button>
               <button type="button" class="btn-action quick-time-btn" id="clearTimeBtn" style="padding:0.4rem 0.8rem; border-radius:6px; cursor:pointer; display:none; background:var(--danger); color:white; border:none;">İptal Et</button>
            </div>
            <input type="datetime-local" id="scheduledTimeInput" style="padding:0.75rem; width:100%; border:1px solid var(--border); border-radius:10px; outline:none;" />
          </div>
`;

const sidebarItem = `
      <a href="#" class="nav-item" data-folder="scheduled">
        <i class="fa-solid fa-calendar-days"></i>
        <span>Zamanlanmış</span>
      </a>
`;

for (const file of files) {
    const p = path.join('c:/Users/HP/Desktop/intra-mail-hub-main/web/pages/portals', file);
    if (!fs.existsSync(p)) continue;
    let content = fs.readFileSync(p, 'utf-8');
    
    // Replace the old scheduled form group with the new one
    content = content.replace(/<div class="form-group">\s*<label><i class="fa-solid fa-clock"><\/i> Zamanlı Gönderim - <i>Opsiyonel<\/i><\/label>\s*<input type="datetime-local" id="scheduledTimeInput"[^>]*>\s*<\/div>/, quickButtons.trim());
    
    // Add the Zamanlanmış tab after Gönderilenler
    if (!content.includes('data-folder="scheduled"')) {
        content = content.replace(/(<a href="#" class="nav-item" data-folder="sent">[\s\S]*?<\/a>)/, `$1\n${sidebarItem}`);
    }

    // Add Edit Button in the action row
    if (!content.includes('id="btnEditScheduled"')) {
        content = content.replace(/(<button id="btnArchive" class="btn-action" title="Arşivle">)/, `<button id="btnEditScheduled" class="btn-action hidden" style="color:var(--primary); border-color:var(--primary);" title="Mesajı Düzenle"><i class="fa-solid fa-pen-to-square"></i> Düzenle</button>\n              $1`);
    }

    fs.writeFileSync(p, content);
    console.log("Updated", file);
}
