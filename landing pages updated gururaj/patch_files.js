const fs = require('fs');
const path = require('path');

const directories = ["en", "hi", "mr", "gu"];

const css_to_add = `
  /* ---------- language selector ---------- */
  .lang-selector {
    background: var(--bg);
    border-bottom: 1px solid var(--line);
    padding: 8px 20px;
    display: flex;
    gap: 8px;
    overflow-x: auto;
    white-space: nowrap;
    position: sticky;
    top: 58px;
    z-index: 49;
    -webkit-overflow-scrolling: touch;
  }
  .lang-selector::-webkit-scrollbar { display: none; }
  .lang-selector a {
    display: inline-block;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 700;
    color: var(--muted);
    background: var(--soft);
    border: 1px solid var(--line);
    transition: all .2s;
    flex: 0 0 auto;
    text-decoration: none;
  }
  .lang-selector a.active {
    color: var(--brand);
    background: #f0eafc;
    border-color: #e2d7f8;
  }
  .help-float {
    position: fixed; bottom: 24px; right: 24px; z-index: 998;
    padding: 12px 22px; border-radius: 999px; background: var(--brand);
    display: flex; align-items: center; justify-content: center; gap: 8px;
    box-shadow: 0 4px 16px rgba(58,31,168,0.35); transition: all .2s;
    color: white; font-size: 13.5px; font-weight: 600; text-decoration: none;
  }
  .help-float:hover { transform: translateY(-2px); box-shadow: 0 6px 24px rgba(58,31,168,0.45); }
  @media (max-width: 768px) { .help-float { bottom: 80px; } }
`;

const tracking_head = `
  <!-- Meta Pixel Code -->
  <script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', '326242339368504');
  fbq('track', 'PageView');
  </script>
  <noscript><img height="1" width="1" style="display:none"
  src="https://www.facebook.com/tr?id=326242339368504&ev=PageView&noscript=1"
  /></noscript>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-X1HK0NPQT8"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-X1HK0NPQT8');
  </script>
</head>
`;

function patch_file(lang) {
    const file_path = path.join(lang, "index.html");
    if (!fs.existsSync(file_path)) {
        console.log(`${file_path} not found`);
        return;
    }

    let content = fs.readFileSync(file_path, "utf-8");

    // 1. Update Favicon (and Canonical if english)
    if (content.includes("<!-- Open Graph / share preview -->")) {
        let favicon = '<link rel="icon" type="image/png" href="../assets/logo.png">\n';
        if (!content.includes("canonical") && lang === "en") {
            favicon += '<link rel="canonical" href="https://ordertaker.kiko.live/">\n';
        }
        content = content.replace("<!-- Open Graph / share preview -->", favicon + "<!-- Open Graph / share preview -->");
    }

    content = content.replace(/content="logo_kiko\.png"/g, 'content="../assets/logo.png"');
    content = content.replace(/src="logo_kiko\.png"/g, 'src="../assets/logo.png"');

    // 2. CSS
    content = content.replace("  /* ---------- top bar ---------- */", css_to_add + "\n  /* ---------- top bar ---------- */");
    content = content.replace(".band .cta-wrap{max-width:340px}", ".band .cta-wrap{max-width:340px; margin: 0 auto;}");

    // 3. Lang Selector HTML
    const lang_html = `
<div class="lang-selector">
  <a href="../en/" class="${lang === 'en' ? 'active' : ''}">🇬🇧 English</a>
  <a href="../hi/" class="${lang === 'hi' ? 'active' : ''}">🇮🇳 हिन्दी</a>
  <a href="../mr/" class="${lang === 'mr' ? 'active' : ''}">🇮🇳 मराठी</a>
  <a href="../gu/" class="${lang === 'gu' ? 'active' : ''}">🇮🇳 ગુજરાતી</a>
</div>
`;
    content = content.replace("</header>", "</header>\n" + lang_html);

    // 4. Shark Tank Topbar
    const topbar_shark = '<span class="shark">🦈 Shark Tank S3</span>';
    const new_topbar_shark = `
      <div style="display:flex;align-items:center;gap:6px;">
        <span class="shark" style="background:#2c0f6e;color:#fff;border-color:#2c0f6e;">✨ Patented Solution</span>
        <img src="../assets/shark-tank-logo.jpg" alt="Shark Tank" style="height:32px;border-radius:50%;">
      </div>
`;
    content = content.replace(topbar_shark + "<!-- i18n -->", new_topbar_shark);
    content = content.replace(topbar_shark, new_topbar_shark);

    // 5. Shark Tank CTA Band
    const cta_shark = "<span>🦈 As Seen on Shark Tank India S3</span>";
    const new_cta_shark = '<span><img src="../assets/shark-tank-logo.jpg" alt="Shark Tank" style="height:40px;vertical-align:middle;margin-right:6px;border-radius:50%;"></span>';
    content = content.replace(cta_shark + "<!-- i18n -->", new_cta_shark);
    content = content.replace(cta_shark, new_cta_shark);

    // 6. Contact Details
    content = content.replace(/<a href="tel:\+919625639692">.*?<\/a>(<!-- i18n -->)?\n?/g, '');

    // 7. Float button & Tracking
    content = content.replace("</head>", tracking_head);

    const tracking_body = `
<!-- Help & Support Float -->
<a href="https://ordertaker.kiko.live/selfhelp/" class="help-float" aria-label="Help & Support">Help & Support</a>

<script>
  document.addEventListener('DOMContentLoaded', function() {
    var lastPurchaseFired = 0;
    var playLinks = document.querySelectorAll('a[data-cta]');
    playLinks.forEach(function(link) {
      link.addEventListener('click', function() {
        var now = Date.now();
        if (now - lastPurchaseFired < 2000) return;
        lastPurchaseFired = now;
        var eventId = 'ordertaker_purchase_' + now;
        if (typeof fbq === 'function') {
          fbq('track', 'Purchase', { currency: 'INR', value: 1.00 }, { eventID: eventId });
        }
        if (typeof gtag === 'function') {
          gtag('event', 'ordertakerpurchase', {
            currency: 'INR', value: 1.00, transaction_id: eventId, event_id: eventId,
            event_category: 'conversion', event_label: 'ordertaker_${lang}', page_type: 'ordertaker_landing'
          });
        }
      });
    });
  });
</script>
</body>
`;
    content = content.replace("</body>", tracking_body);

    fs.writeFileSync(file_path, content, "utf-8");
    console.log("Patched " + file_path);
}

directories.forEach(patch_file);
