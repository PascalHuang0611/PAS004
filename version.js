// 全站共用版本號,升版只改這裡 (index.html / answer.html / compare.html 右上角)
const APP_VERSION = '1.2.0';

document.addEventListener('DOMContentLoaded', () => {
    const versionTag = document.createElement('div');
    versionTag.id = 'app-version';
    versionTag.textContent = `v${APP_VERSION}`;
    document.body.appendChild(versionTag);
});
