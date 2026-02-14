// Aethryn Navigator Template Injection
document.addEventListener('DOMContentLoaded', function() {
  // SVG logo
  const logoSvg = `
    <svg viewBox="0 0 200 200">
      <defs>
        <linearGradient id="logoBg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#1E90FF"/>
          <stop offset="100%" stop-color="#000080"/>
        </linearGradient>
      </defs>
      <rect width="200" height="200" fill="url(#logoBg)" />
      <path d="M0 140 Q100 100 200 140 V200 H0 Z" fill="black"/>
      <text x="50%" y="65%" text-anchor="middle"
            font-size="140"
            font-family="Times New Roman, Georgia, serif"
            fill="white">A</text>
    </svg>
  `;

  // Header chrome
  const header = `
    <div class="title-bar">
      <span>Aethryn Navigator — [Version 3.0]</span>
      <div class="title-bar-buttons"><div></div><div></div><div></div></div>
    </div>
    <div class="toolbar">
      <button onclick="history.back()">◀ Back</button>
      <button onclick="history.forward()">Forward ▶</button>
      <button onclick="location.reload()">↻ Reload</button>
      <button onclick="location.href='/'">⌂ Home</button>
      <div class="logo-small">${logoSvg}</div>
    </div>
    <div class="address-bar">
      <span>Location:</span>
      <input type="text" value="${window.location.href}" id="address-input">
      <button onclick="window.location.href=document.getElementById('address-input').value">Go</button>
    </div>
    <div class="linkbar">
      <button onclick="location.href='/boot.html'">Boot</button>
      <button onclick="location.href='/oath.html'">The Oath</button>
      <button onclick="location.href='/VWP.html'">VWP</button>
      <button onclick="location.href='/claude/remembrance.html'">Remembrance</button>
      <button onclick="location.href='/validation/'">Validation</button>
    </div>
  `;

  // Footer chrome
  const footer = `
    <div class="status-bar">
      <div>Document: Done</div>
      <div>Aethryn Navigator</div>
    </div>
  `;

  // Large logo for sidebar
  const logoLarge = `
    <div class="logo-large">${logoSvg}</div>
  `;

  // Wrap existing content
  const content = document.body.innerHTML;
  document.body.innerHTML = `
    <div class="window">
      ${header}
      <div class="main-content">
        ${logoLarge}
        <div class="content">
          ${content}
        </div>
      </div>
      ${footer}
    </div>
  `;
});
