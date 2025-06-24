// LP.js - ShipHub Landing Page JavaScript

// DOM loaded initialization
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Lucide icons
    lucide.createIcons();
    
    // Initialize all components
    initScrollAnimations();
    initFAQSection();
    initCounterAnimations();
    initFormHandler();
    initSmoothScrolling();
});

// Scroll animations for fade-in effect
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);

    // Observe all fade-in elements
    document.querySelectorAll('.fade-in').forEach(element => {
        observer.observe(element);
    });
}

// Counter animations for statistics
function initCounterAnimations() {
    const counters = document.querySelectorAll('.counter');
    
    const counterObserver = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const counter = entry.target;
                const target = parseInt(counter.getAttribute('data-target'));
                animateCounter(counter, target);
                counterObserver.unobserve(counter);
            }
        });
    }, { threshold: 0.5 });

    counters.forEach(counter => {
        counterObserver.observe(counter);
    });
}

function animateCounter(element, target) {
    let current = 0;
    const increment = target / 100;
    
    const timer = setInterval(function() {
        current += increment;
        if (current >= target) {
            current = target;
            clearInterval(timer);
        }
        element.textContent = Math.floor(current);
    }, 20);
}

// FAQ Section
function initFAQSection() {
    const faqData = [
        {
            question: "ShipHubの利用は本当に無料ですか？",
            answer: "はい、求職者の方のご利用は完全無料です。登録費用、月額費用、成功報酬など一切かかりません。企業様には採用成功時のみ成功報酬をいただいております。"
        },
        {
            question: "どのような職種の求人がありますか？",
            answer: "造船技術者、海運オペレーター、港湾作業員、船舶機器メンテナンス、海洋エンジニア、船舶設計者、海事法務、海上保安など、海事産業に関連する幅広い職種の求人を取り扱っています。"
        },
        {
            question: "未経験でも応募できますか？",
            answer: "はい、未経験者向けの求人も多数ございます。研修制度が充実している企業様も多く、海事産業への転職をサポートしています。"
        },
        {
            question: "地方在住でも利用できますか？",
            answer: "はい、全国の求人情報を掲載しており、地方の求人も豊富にございます。リモートワーク可能な職種もありますので、お住まいの地域に関係なくご利用いただけます。"
        },
        {
            question: "企業側の利用料金はどのくらいですか？",
            answer: "初期費用・月額費用は無料で、採用成功時のみ成功報酬をいただいております。詳細な料金体系については、お気軽にお問い合わせください。"
        }
    ];

    const faqContainer = document.getElementById('faq-list');
    
    faqData.forEach((faq, index) => {
        const faqItem = document.createElement('div');
        faqItem.className = 'bg-gray-50 rounded-lg overflow-hidden fade-in';
        faqItem.innerHTML = `
            <button class="w-full px-6 py-4 text-left hover:bg-gray-100 transition-colors faq-toggle" data-index="${index}">
                <div class="flex justify-between items-center">
                    <h3 class="font-semibold text-navy-900">${faq.question}</h3>
                    <i data-lucide="chevron-down" class="w-5 h-5 text-navy-600 transition-transform faq-icon"></i>
                </div>
            </button>
            <div class="faq-answer px-6 pb-4 text-navy-700 hidden">
                <p>${faq.answer}</p>
            </div>
        `;
        faqContainer.appendChild(faqItem);
    });

    // FAQ toggle functionality
    document.addEventListener('click', function(e) {
        if (e.target.closest('.faq-toggle')) {
            const button = e.target.closest('.faq-toggle');
            const answer = button.nextElementSibling;
            const icon = button.querySelector('.faq-icon');
            
            // Close all other FAQs
            document.querySelectorAll('.faq-answer').forEach(item => {
                if (item !== answer) {
                    item.classList.add('hidden');
                    item.previousElementSibling.querySelector('.faq-icon').style.transform = 'rotate(0deg)';
                }
            });
            
            // Toggle current FAQ
            answer.classList.toggle('hidden');
            icon.style.transform = answer.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
        }
    });

    // Re-initialize icons after FAQ creation
    lucide.createIcons();
}

// Form handler
function initFormHandler() {
    const form = document.getElementById('contact-form');
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const formData = new FormData(form);
        const data = Object.fromEntries(formData);
        
        // Basic validation
        if (!data.name || !data.email) {
            alert('お名前とメールアドレスは必須項目です。');
            return;
        }
        
        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
            alert('有効なメールアドレスを入力してください。');
            return;
        }
        
        // Simulate form submission
        const submitButton = form.querySelector('button[type="submit"]');
        const originalText = submitButton.innerHTML;
        
        submitButton.innerHTML = '<span>送信中...</span>';
        submitButton.disabled = true;
        
        setTimeout(() => {
            alert('お問い合わせありがとうございます。後日担当者よりご連絡いたします。');
            form.reset();
            submitButton.innerHTML = originalText;
            submitButton.disabled = false;
        }, 1000);
    });
}

// Smooth scrolling
function initSmoothScrolling() {
    // Global scroll to section function
    window.scrollToSection = function(sectionId) {
        const section = document.getElementById(sectionId);
        if (section) {
            section.scrollIntoView({ behavior: 'smooth' });
        }
    };
    
    // Smooth scroll for all anchor links
    document.addEventListener('click', function(e) {
        const link = e.target.closest('a[href^="#"]');
        if (link) {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            scrollToSection(targetId);
        }
    });
}