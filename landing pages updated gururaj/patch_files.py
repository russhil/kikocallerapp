import os
import re

directories = ["en", "hi", "mr", "gu"]

def patch_file(lang):
    file_path = os.path.join(lang, "index.html")
    if not os.path.exists(file_path):
        print(f"{file_path} not found")
        return

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Update Favicon (and Canonical if english)
    if "<!-- Open Graph / share preview -->" in content:
        favicon = '<link rel="icon" type="image/png" href="../assets/logo.png">\n'
        if "canonical" not in content and lang == "en":
            favicon += '<link rel="canonical" href="https://ordertaker.kiko.live/">\n'
        content = content.replace("<!-- Open Graph / share preview -->", favicon + "<!-- Open Graph / share preview -->")

    # Fix old logo image path in OG tags
    content = content.replace('content="logo_kiko.png"', 'content="../assets/logo.png"')
    # Fix top bar brand logo
    content = content.replace('src="logo_kiko.png"', 'src="../assets/logo.png"')

    # 2. Add Lang Selector CSS and other CSS fixes
    css_to_add = """
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
"""
    content = content.replace("  /* ---------- top bar ---------- */", css_to_add + "\n  /* ---------- top bar ---------- */")

    # Center install button
    content = content.replace(".band .cta-wrap{max-width:340px}", ".band .cta-wrap{max-width:340px; margin: 0 auto;}")

    # 3. Add Language Selector HTML
    lang_html = f"""
<div class="lang-selector">
  <a href="../en/" class="{'active' if lang == 'en' else ''}">🇬🇧 English</a>
  <a href="../hi/" class="{'active' if lang == 'hi' else ''}">🇮🇳 हिन्दी</a>
  <a href="../mr/" class="{'active' if lang == 'mr' else ''}">🇮🇳 मराठी</a>
  <a href="../gu/" class="{'active' if lang == 'gu' else ''}">🇮🇳 ગુજરાતી</a>
</div>
"""
    content = content.replace("</header>", "</header>\n" + lang_html)

    # 4. Shark Tank & Patented Badge in Topbar
    topbar_shark = '<span class="shark">🦈 Shark Tank S3</span>'
    new_topbar_shark = """
      <div style="display:flex;align-items:center;gap:6px;">
        <span class="shark" style="background:#2c0f6e;color:#fff;border-color:#2c0f6e;">✨ Patented Solution</span>
        <img src="../assets/shark-tank-logo.jpg" alt="Shark Tank" style="height:32px;border-radius:50%;">
      </div>
"""
    content = content.replace(topbar_shark + "<!-- i18n -->", new_topbar_shark)
    content = content.replace(topbar_shark, new_topbar_shark)

    # 5. Shark Tank in CTA Band
    cta_shark = "<span>🦈 As Seen on Shark Tank India S3</span>"
    new_cta_shark = '<span><img src="../assets/shark-tank-logo.jpg" alt="Shark Tank" style="height:40px;vertical-align:middle;margin-right:6px;border-radius:50%;"></span>'
    content = content.replace(cta_shark + "<!-- i18n -->", new_cta_shark)
    content = content.replace(cta_shark, new_cta_shark)

    # 6. Contact details
    # Remove phone number
    content = re.sub(r'<a href="tel:\+919625639692">.*?</a>(<!-- i18n -->)?\n?', '', content)
    
    # 7. Add Floating Help Button & SEO/Tracking
    tracking_head = """
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
"""
    content = content.replace("</head>", tracking_head)

    tracking_body = f"""
<!-- Help & Support Float -->
<a href="https://ordertaker.kiko.live/selfhelp/" class="help-float" aria-label="Help & Support">Help & Support</a>

<script>
  document.addEventListener('DOMContentLoaded', function() {{
    var lastPurchaseFired = 0;
    var playLinks = document.querySelectorAll('a[data-cta]');
    playLinks.forEach(function(link) {{
      link.addEventListener('click', function() {{
        var now = Date.now();
        if (now - lastPurchaseFired < 2000) return;
        lastPurchaseFired = now;
        var eventId = 'ordertaker_purchase_' + now;
        if (typeof fbq === 'function') {{
          fbq('track', 'Purchase', {{ currency: 'INR', value: 1.00 }}, {{ eventID: eventId }});
        }}
        if (typeof gtag === 'function') {{
          gtag('event', 'ordertakerpurchase', {{
            currency: 'INR', value: 1.00, transaction_id: eventId, event_id: eventId,
            event_category: 'conversion', event_label: 'ordertaker_{lang}', page_type: 'ordertaker_landing'
          }});
        }}
      }});
    }});
  }});
</script>
</body>
"""
    content = content.replace("</body>", tracking_body)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Patched {file_path}")

for d in directories:
    patch_file(d)
