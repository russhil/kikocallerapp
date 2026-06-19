/* ============================================
   KIKO AI ORDER TAKER - Landing Page Scripts
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initMobileMenu();
  initParticles();
  initScrollReveal();
  initSmoothScroll();
  initStickyCTA();
  initCountUp();
  initFAQ();
});

/* --- Navbar scroll effect --- */
function initNavbar() {
  const nav = document.getElementById('navbar');
  let lastScroll = 0;

  function onScroll() {
    const currentScroll = window.scrollY;
    if (currentScroll > 50) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
    lastScroll = currentScroll;
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // run once on load
}

/* --- Mobile menu toggle --- */
function initMobileMenu() {
  const menuBtn = document.getElementById('nav-menu-btn');
  const mobileNav = document.getElementById('nav-mobile');
  const overlay = document.getElementById('mobile-overlay');

  if (!menuBtn || !mobileNav) return;

  function toggleMenu() {
    const isOpen = mobileNav.classList.contains('open');
    mobileNav.classList.toggle('open');
    menuBtn.classList.toggle('open');
    overlay.classList.toggle('active');
    document.body.style.overflow = isOpen ? '' : 'hidden';
  }

  function closeMenu() {
    mobileNav.classList.remove('open');
    menuBtn.classList.remove('open');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  menuBtn.addEventListener('click', toggleMenu);
  overlay.addEventListener('click', closeMenu);

  // Close on link click
  mobileNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeMenu);
  });
}

/* --- Floating particles in hero --- */
function initParticles() {
  const container = document.getElementById('hero-particles');
  if (!container) return;

  const particleCount = window.innerWidth < 768 ? 15 : 30;

  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.classList.add('particle');
    particle.style.left = Math.random() * 100 + '%';
    particle.style.animationDuration = (6 + Math.random() * 6) + 's';
    particle.style.animationDelay = (Math.random() * 8) + 's';
    particle.style.width = (2 + Math.random() * 3) + 'px';
    particle.style.height = particle.style.width;
    particle.style.opacity = 0;
    container.appendChild(particle);
  }
}

/* --- Scroll reveal animations --- */
function initScrollReveal() {
  const revealElements = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');

  if (!revealElements.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target); // animate only once
      }
    });
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -40px 0px'
  });

  revealElements.forEach(el => observer.observe(el));
}

/* --- Smooth scroll for anchor links --- */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#') return;

      const target = document.querySelector(targetId);
      if (!target) return;

      e.preventDefault();

      const navHeight = document.getElementById('navbar').offsetHeight;
      const targetPosition = target.getBoundingClientRect().top + window.scrollY - navHeight - 20;

      window.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
      });
    });
  });
}

/* --- Mobile sticky CTA visibility --- */
function initStickyCTA() {
  const stickyCTA = document.getElementById('sticky-cta');
  const hero = document.getElementById('hero');

  if (!stickyCTA || !hero) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        stickyCTA.classList.remove('visible');
      } else {
        stickyCTA.classList.add('visible');
      }
    });
  }, {
    threshold: 0.1
  });

  observer.observe(hero);
}

/* --- Number count-up animation --- */
function initCountUp() {
  const statNumbers = document.querySelectorAll('.stat-item__number[data-count]');

  if (!statNumbers.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseInt(el.getAttribute('data-count'), 10);
        animateCount(el, target);
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.5 });

  statNumbers.forEach(el => observer.observe(el));
}

function animateCount(element, target) {
  const duration = 2000;
  const start = 0;
  const startTime = performance.now();
  const suffix = '+';

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(start + (target - start) * eased);

    element.textContent = current.toLocaleString('en-IN') + suffix;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

/* --- Active nav link highlighting --- */
(function initActiveNav() {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav__links a');

  if (!sections.length || !navLinks.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinks.forEach(link => {
          link.classList.toggle('active',
            link.getAttribute('href') === `#${id}`
          );
        });
      }
    });
  }, {
    threshold: 0.3,
    rootMargin: '-80px 0px -50% 0px'
  });

  sections.forEach(section => observer.observe(section));
})();

/* --- FAQ Accordion --- */
function initFAQ() {
  const faqItems = document.querySelectorAll('.faq-item');
  if (!faqItems.length) return;

  faqItems.forEach(item => {
    const question = item.querySelector('.faq-item__question');
    if (!question) return;

    question.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');

      // Close all other items
      faqItems.forEach(other => {
        if (other !== item) other.classList.remove('open');
      });

      // Toggle current
      item.classList.toggle('open', !isOpen);
    });
  });
}
