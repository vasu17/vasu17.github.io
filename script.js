document.addEventListener('DOMContentLoaded', () => {
    // Theme toggle button navigates to the personal experience
    const themeToggle = document.getElementById('theme-toggle');

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            window.location.href = 'personal.html';
        });
    }

    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');

    if (mobileMenuBtn && navLinks) {
        const body = document.body;
        const navOverlay = ensureOverlay();

        mobileMenuBtn.setAttribute('aria-expanded', 'false');

        const openMenu = () => {
            navLinks.classList.add('active');
            mobileMenuBtn.classList.add('active');
            body.classList.add('menu-open');
            navOverlay.classList.add('active');
            mobileMenuBtn.setAttribute('aria-expanded', 'true');
        };

        const closeMenu = () => {
            navLinks.classList.remove('active');
            mobileMenuBtn.classList.remove('active');
            body.classList.remove('menu-open');
            navOverlay.classList.remove('active');
            mobileMenuBtn.setAttribute('aria-expanded', 'false');
        };

        const toggleMenu = () => {
            if (navLinks.classList.contains('active')) {
                closeMenu();
            } else {
                openMenu();
            }
        };

        mobileMenuBtn.addEventListener('click', toggleMenu);
        navOverlay.addEventListener('click', closeMenu);

        navLinks.querySelectorAll('a').forEach((link) => {
            link.addEventListener('click', closeMenu);
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) {
                closeMenu();
            }
        });
    }

    function ensureOverlay() {
        let overlay = document.querySelector('.nav-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'nav-overlay';
            document.body.appendChild(overlay);
        }
        return overlay;
    }
});
