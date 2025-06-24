// ShipHub - 統合アプリケーション
// 全機能を統合したメインJavaScriptファイル

(function() {
    'use strict';

    // =============================================================================
    // 設定・定数
    // =============================================================================
    
    const CONFIG = {
        API: {
            TOKEN: 'patV6se7KmGamuWT7.451356d3945a45135d354b363a2abd6d9c4d1ce9f74b0cdabee77f8dd055ddbb',
            BASE_ID: 'appD06KJ0je7fo62a',
            USER_TABLE: 'ユーザー管理',
            JOBS_TABLE: '求人',
            APPLICATION_TABLE: '応募履歴'
        },
        SESSION: {
            KEY: 'shiphub_session',
            EXPIRY_HOURS: 24
        },
        SECURITY: {
            SALT: 'shiphub_salt_2024',
            MAX_LOGIN_ATTEMPTS: 5,
            LOCKOUT_HOURS: 1
        },
        ROUTES: {
            COMPANY_HOME: 'post-job.html',
            USER_HOME: 'index.html',
            COMPANY_LOGIN: 'company-login.html',
            USER_LOGIN: 'user-login.html'
        },
        PROXY_URL: 'https://cors-anywhere.herokuapp.com/'
    };

    // =============================================================================
    // 認証システム
    // =============================================================================
    
    const ShipHubAuth = {
        // セッション管理
        session: {
            save(userData) {
                const sessionData = {
                    userId: userData.id,
                    email: userData.fields['メールアドレス'],
                    userType: userData.fields['ユーザータイプ'],
                    companyName: userData.fields['会社名'] || null,
                    loginTime: new Date().toISOString(),
                    isAuthenticated: true
                };
                try {
                    sessionStorage.setItem(CONFIG.SESSION.KEY, JSON.stringify(sessionData));
                    return true;
                } catch (e) {
                    console.error('Session save error:', e);
                    return false;
                }
            },

            get() {
                try {
                    const sessionStr = sessionStorage.getItem(CONFIG.SESSION.KEY);
                    if (!sessionStr) return null;
                    
                    const session = JSON.parse(sessionStr);
                    
                    // 有効期限チェック
                    const loginTime = new Date(session.loginTime);
                    const now = new Date();
                    const hoursDiff = (now - loginTime) / (1000 * 60 * 60);
                    
                    if (hoursDiff > CONFIG.SESSION.EXPIRY_HOURS) {
                        this.clear();
                        return null;
                    }
                    
                    return session;
                } catch (e) {
                    this.clear();
                    return null;
                }
            },

            clear() {
                try {
                    sessionStorage.removeItem(CONFIG.SESSION.KEY);
                } catch (e) {
                    console.error('Session clear error:', e);
                }
            },

            isValid(requiredUserType = null) {
                const session = this.get();
                if (!session || !session.isAuthenticated) {
                    return false;
                }
                
                if (requiredUserType && session.userType !== requiredUserType) {
                    return false;
                }
                
                return true;
            }
        },

        // セキュリティユーティリティ
        security: {
            hashPassword(password) {
                if (!password) return '';
                return btoa(password + CONFIG.SECURITY.SALT);
            },

            sanitizeInput(input) {
                if (!input) return '';
                return input.toString().trim().replace(/[<>"'&]/g, '');
            },

            checkLoginAttempts(email) {
                const attemptKey = `login_attempts_${this.sanitizeInput(email)}`;
                const lastAttemptKey = `last_attempt_${this.sanitizeInput(email)}`;
                
                const attempts = parseInt(localStorage.getItem(attemptKey) || '0');
                const lastAttempt = localStorage.getItem(lastAttemptKey);
                
                if (lastAttempt) {
                    const hoursSinceLastAttempt = (new Date() - new Date(lastAttempt)) / (1000 * 60 * 60);
                    if (hoursSinceLastAttempt > CONFIG.SECURITY.LOCKOUT_HOURS) {
                        this.resetLoginAttempts(email);
                        return true;
                    }
                }
                
                return attempts < CONFIG.SECURITY.MAX_LOGIN_ATTEMPTS;
            },

            incrementLoginAttempts(email) {
                const attemptKey = `login_attempts_${this.sanitizeInput(email)}`;
                const lastAttemptKey = `last_attempt_${this.sanitizeInput(email)}`;
                
                const attempts = parseInt(localStorage.getItem(attemptKey) || '0');
                localStorage.setItem(attemptKey, (attempts + 1).toString());
                localStorage.setItem(lastAttemptKey, new Date().toISOString());
            },

            resetLoginAttempts(email) {
                const sanitizedEmail = this.sanitizeInput(email);
                localStorage.removeItem(`login_attempts_${sanitizedEmail}`);
                localStorage.removeItem(`last_attempt_${sanitizedEmail}`);
            }
        },

        // API操作
        api: {
            // ユーザーキャッシュで高速化
            userCache: new Map(),
            cacheExpiry: 5 * 60 * 1000, // 5分間キャッシュ

            async findUser(email) {
                const sanitizedEmail = ShipHubAuth.security.sanitizeInput(email);
                
                // キャッシュチェック
                const cacheKey = sanitizedEmail.toLowerCase();
                const cached = this.userCache.get(cacheKey);
                if (cached && (Date.now() - cached.timestamp < this.cacheExpiry)) {
                    return cached.user;
                }

                // 最適化されたAPI呼び出し - より単純なフィルター
                const filterFormula = `{メールアドレス}='${sanitizedEmail}'`;
                const url = `https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.USER_TABLE)}?filterByFormula=${encodeURIComponent(filterFormula)}&maxRecords=1`;
                
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8秒タイムアウト

                    const response = await fetch(url, {
                        headers: {
                            'Authorization': `Bearer ${CONFIG.API.TOKEN}`
                        },
                        signal: controller.signal
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    
                    const data = await response.json();
                    const user = data.records[0] || null;
                    
                    // 結果をキャッシュ
                    this.userCache.set(cacheKey, {
                        user: user,
                        timestamp: Date.now()
                    });
                    
                    return user;
                } catch (error) {
                    if (error.name === 'AbortError') {
                        throw new Error('TIMEOUT_ERROR');
                    }
                    console.error('User lookup error:', error);
                    throw new Error('NETWORK_ERROR');
                }
            },

            // キャッシュクリア
            clearCache() {
                this.userCache.clear();
            },

            async createUser(userData) {
                try {
                    const response = await fetch(`https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.USER_TABLE)}`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${CONFIG.API.TOKEN}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            records: [{
                                fields: userData
                            }]
                        })
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        console.error('Create user error:', errorData);
                        throw new Error(`HTTP ${response.status}`);
                    }

                    const data = await response.json();
                    return data.records[0];
                } catch (error) {
                    console.error('User creation error:', error);
                    throw error;
                }
            }
        },

        // 高速化された認証メイン機能
        async authenticate(email, password, expectedUserType = null) {
            const startTime = performance.now();
            
            try {
                // 基本バリデーション（高速）
                if (!email || !password) {
                    throw new Error('INVALID_INPUT');
                }

                // 簡素化されたレート制限チェック
                if (!this.security.checkLoginAttempts(email)) {
                    throw new Error('LOGIN_ATTEMPTS_EXCEEDED');
                }
                
                // 並行処理で高速化
                const [user] = await Promise.all([
                    this.api.findUser(email)
                ]);
                
                if (!user) {
                    this.security.incrementLoginAttempts(email);
                    throw new Error('USER_NOT_FOUND');
                }
                
                // 最小限のチェック
                const userFields = user.fields;
                if (userFields['アカウント状態'] === '無効') {
                    throw new Error('ACCOUNT_DISABLED');
                }
                
                // パスワード検証（最適化）
                const hashedPassword = this.security.hashPassword(password);
                const storedPassword = userFields['パスワード'];
                
                if (hashedPassword !== storedPassword && password !== storedPassword) {
                    this.security.incrementLoginAttempts(email);
                    throw new Error('WRONG_PASSWORD');
                }
                
                // ユーザータイプチェック
                if (expectedUserType && userFields['ユーザータイプ'] !== expectedUserType) {
                    throw new Error('WRONG_USER_TYPE');
                }
                
                // 成功処理（並行実行）
                this.security.resetLoginAttempts(email);
                this.session.save(user);
                
                const endTime = performance.now();
                console.log(`✅ Login completed in ${(endTime - startTime).toFixed(2)}ms`);
                
                return {
                    success: true,
                    user: {
                        id: user.id,
                        email: userFields['メールアドレス'],
                        userType: userFields['ユーザータイプ'],
                        companyName: userFields['会社名'] || null
                    }
                };
                
            } catch (error) {
                const endTime = performance.now();
                console.log(`❌ Login failed in ${(endTime - startTime).toFixed(2)}ms: ${error.message}`);
                
                return {
                    success: false,
                    error: error.message
                };
            }
        },

        // 登録機能
        async registerUser(formData) {
            try {
                const existingUser = await this.api.findUser(formData.email);
                if (existingUser) {
                    throw new Error('EMAIL_EXISTS');
                }

                const userData = {
                    'メールアドレス': this.security.sanitizeInput(formData.email),
                    'パスワード': this.security.hashPassword(formData.password),
                    'ユーザータイプ': '求職者',
                    '氏名': this.security.sanitizeInput(`${formData.lastName} ${formData.firstName}`)
                };

                const newUser = await this.api.createUser(userData);
                await this.authenticate(formData.email, formData.password, '求職者');
                
                return { success: true, user: newUser };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        async registerCompany(formData) {
            try {
                const existingUser = await this.api.findUser(formData.email);
                if (existingUser) {
                    throw new Error('EMAIL_EXISTS');
                }

                const userData = {
                    'メールアドレス': this.security.sanitizeInput(formData.email),
                    'パスワード': this.security.hashPassword(formData.password),
                    'ユーザータイプ': '企業',
                    '会社名': this.security.sanitizeInput(formData.companyName)
                };

                const newUser = await this.api.createUser(userData);
                await this.authenticate(formData.email, formData.password, '企業');
                
                return { success: true, user: newUser };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        // ページ保護
        requireAuth(userType = null, redirectPage = null) {
            if (!this.session.isValid(userType)) {
                if (redirectPage) {
                    sessionStorage.setItem('shiphub_redirect_after_login', window.location.href);
                    window.location.href = redirectPage;
                }
                return false;
            }
            return true;
        },

        // ログイン後リダイレクト
        redirectAfterLogin(userType) {
            const savedRedirect = sessionStorage.getItem('shiphub_redirect_after_login');
            if (savedRedirect) {
                sessionStorage.removeItem('shiphub_redirect_after_login');
                window.location.href = savedRedirect;
                return;
            }

            const redirectMap = {
                '企業': CONFIG.ROUTES.COMPANY_HOME,
                '求職者': CONFIG.ROUTES.USER_HOME
            };
            
            const destination = redirectMap[userType];
            if (destination) {
                window.location.href = destination;
            }
        },

        // エラーハンドリング
        getErrorMessage(errorCode) {
            const messages = {
                'USER_NOT_FOUND': 'メールアドレスが登録されていません',
                'WRONG_PASSWORD': 'パスワードが間違っています',
                'WRONG_USER_TYPE': 'このページにはアクセスできません',
                'ACCOUNT_DISABLED': 'アカウントが無効化されています',
                'NETWORK_ERROR': '接続エラーが発生しました。しばらくしてからお試しください',
                'TIMEOUT_ERROR': 'ログイン処理がタイムアウトしました。もう一度お試しください',
                'LOGIN_ATTEMPTS_EXCEEDED': 'ログイン試行回数が上限に達しました。1時間後に再度お試しください',
                'INVALID_INPUT': 'メールアドレスとパスワードを入力してください',
                'EMAIL_EXISTS': 'このメールアドレスは既に登録されています',
                'CREATION_ERROR': 'アカウントの作成に失敗しました。もう一度お試しください'
            };
            
            return messages[errorCode] || 'エラーが発生しました';
        },

        logout(redirectTo = CONFIG.ROUTES.USER_HOME) {
            this.session.clear();
            window.location.href = redirectTo;
        },

        getCurrentUser() {
            const session = this.session.get();
            if (!session) return null;
            
            return {
                id: session.userId,
                email: session.email,
                userType: session.userType,
                companyName: session.companyName
            };
        }
    };

    // =============================================================================
    // 求人管理システム
    // =============================================================================
    
    const ShipHubJobs = {
        // 求人取得
        async fetchJobs() {
            const response = await fetch(`https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.JOBS_TABLE)}`, {
                headers: { 'Authorization': `Bearer ${CONFIG.API.TOKEN}` }
            });
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            const data = await response.json();
            return data.records;
        },

        // 求人カード生成
        createJobCard(job) {
            const fields = job.fields;
            const salary = fields.年収 ? `${fields.年収}万円` : '要相談';
            const status = fields.応募ステータス || '募集中';
            const statusClass = status === '募集中' ? 'active' : 'paused';
            return `
                <div class="job-card" data-job='${JSON.stringify({
                    jobId: job.id,
                    position: fields.職種 || '',
                    company: fields.企業名 || '',
                    region: fields.地域 || '',
                    location: fields.勤務地 || '',
                    salary: fields.年収 || ''
                })}'>
                    <div class="job-title">${fields.職種 || '職種未設定'}</div>
                    <div class="job-company">${fields.企業名 || '企業名未設定'}</div>
                    <div class="status ${statusClass}">${status}</div>
                    <div class="job-details">
                        <div class="detail-item"><div class="detail-icon">📍</div><span><strong>地域:</strong> ${fields.地域 || '未設定'}</span></div>
                        <div class="detail-item"><div class="detail-icon">🏢</div><span><strong>勤務地:</strong> ${fields.勤務地 || '未設定'}</span></div>
                        <div class="detail-item"><div class="detail-icon">📅</div><span><strong>募集開始:</strong> ${fields.募集開始日 || '未設定'}</span></div>
                    </div>
                    <div class="salary">💰 年収: ${salary}</div>
                    <button class="apply-btn">この求人に応募する</button>
                </div>
            `;
        },

        // 応募記録
        async recordApplication({company, position, jobId}, name, email, message) {
            try {
                const response = await fetch(`https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.APPLICATION_TABLE)}`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${CONFIG.API.TOKEN}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        records: [
                            { fields: {
                                '会社名': company,
                                '職種': position,
                                '名前': name,
                                'メールアドレス': email,
                                '自己紹介': message,
                                ...(jobId ? { '求人ID': jobId } : {})
                            }}
                        ]
                    })
                });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return true;
            } catch (error) {
                // CORS対応
                if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
                    try {
                        const proxyResponse = await fetch(`${CONFIG.PROXY_URL}https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.APPLICATION_TABLE)}`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${CONFIG.API.TOKEN}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                records: [{ fields: {
                                    '会社名': company, '職種': position, '名前': name,
                                    'メールアドレス': email, '自己紹介': message,
                                    ...(jobId ? { '求人ID': jobId } : {})
                                }}]
                            })
                        });
                        if (!proxyResponse.ok) throw new Error('PROXY_ERROR');
                        return true;
                    } catch (proxyError) {
                        throw new Error('CORS_ERROR');
                    }
                }
                throw error;
            }
        },

        // 求人投稿
        async postJob(jobData) {
            try {
                const response = await fetch(`https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.JOBS_TABLE)}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${CONFIG.API.TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ records: [{ fields: jobData }] })
                });
                if (!response.ok) throw new Error(await response.text());
                return true;
            } catch (error) {
                // CORS対応
                if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
                    const proxyResponse = await fetch(`${CONFIG.PROXY_URL}https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.JOBS_TABLE)}`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${CONFIG.API.TOKEN}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ records: [{ fields: jobData }] })
                    });
                    if (!proxyResponse.ok) throw new Error('PROXY_ERROR');
                    return true;
                }
                throw error;
            }
        }
    };

    // =============================================================================
    // ランディングページ機能
    // =============================================================================
    
    const ShipHubLP = {
        // アニメーション初期化
        initScrollAnimations() {
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

            document.querySelectorAll('.fade-in').forEach(element => {
                observer.observe(element);
            });
        },

        // カウンターアニメーション
        initCounterAnimations() {
            const counters = document.querySelectorAll('.counter');
            
            const counterObserver = new IntersectionObserver(function(entries) {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const counter = entry.target;
                        const target = parseInt(counter.getAttribute('data-target'));
                        ShipHubLP.animateCounter(counter, target);
                        counterObserver.unobserve(counter);
                    }
                });
            }, { threshold: 0.5 });

            counters.forEach(counter => {
                counterObserver.observe(counter);
            });
        },

        animateCounter(element, target) {
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
        },

        // FAQ初期化
        initFAQSection() {
            const faqData = [
                {
                    question: "ShipHubの利用は本当に無料ですか？",
                    answer: "はい、求職者の方のご利用は完全無料です。登録費用、月額費用、成功報酬など一切かかりません。"
                },
                {
                    question: "どのような職種の求人がありますか？",
                    answer: "造船技術者、海運オペレーター、港湾作業員、船舶機器メンテナンス、海洋エンジニアなど、海事産業に関連する幅広い職種の求人を取り扱っています。"
                },
                {
                    question: "未経験でも応募できますか？",
                    answer: "はい、未経験者向けの求人も多数ございます。研修制度が充実している企業様も多く、海事産業への転職をサポートしています。"
                }
            ];

            const faqContainer = document.getElementById('faq-list');
            if (!faqContainer) return;
            
            faqData.forEach((faq, index) => {
                const faqItem = document.createElement('div');
                faqItem.className = 'bg-gray-50 rounded-lg overflow-hidden fade-in';
                faqItem.innerHTML = `
                    <button class="w-full px-6 py-4 text-left hover:bg-gray-100 transition-colors faq-toggle" data-index="${index}">
                        <div class="flex justify-between items-center">
                            <h3 class="font-semibold text-navy-900">${faq.question}</h3>
                            <span class="text-navy-600 transition-transform faq-icon">▼</span>
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
        },

        // スムーススクロール
        initSmoothScrolling() {
            window.scrollToSection = function(sectionId) {
                const section = document.getElementById(sectionId);
                if (section) {
                    section.scrollIntoView({ behavior: 'smooth' });
                }
            };
            
            document.addEventListener('click', function(e) {
                const link = e.target.closest('a[href^="#"]');
                if (link) {
                    e.preventDefault();
                    const targetId = link.getAttribute('href').substring(1);
                    scrollToSection(targetId);
                }
            });
        }
    };

    // =============================================================================
    // メインアプリケーション初期化
    // =============================================================================
    
    const ShipHubApp = {
        init() {
            // ページタイプ判定
            const currentPage = this.getCurrentPageType();
            
            // 共通初期化
            this.initCommonFeatures();
            
            // ページ別初期化
            switch(currentPage) {
                case 'landing':
                    this.initLandingPage();
                    break;
                case 'user-dashboard':
                    this.initUserDashboard();
                    break;
                case 'company-dashboard':
                    this.initCompanyDashboard();
                    break;
                case 'auth':
                    this.initAuthPages();
                    break;
            }
        },

        getCurrentPageType() {
            const path = window.location.pathname;
            const filename = path.split('/').pop() || 'index.html';
            
            if (filename === 'LP.html') return 'landing';
            if (filename === 'index.html') return 'user-dashboard';
            if (filename === 'post-job.html') return 'company-dashboard';
            if (filename.includes('login') || filename.includes('register')) return 'auth';
            
            return 'unknown';
        },

        initCommonFeatures() {
            // グローバル認証機能
            window.ShipHubAuth = ShipHubAuth;
            window.requireAuth = ShipHubAuth.requireAuth.bind(ShipHubAuth);
            window.logout = ShipHubAuth.logout.bind(ShipHubAuth);
        },

        initLandingPage() {
            ShipHubLP.initScrollAnimations();
            ShipHubLP.initCounterAnimations();
            ShipHubLP.initFAQSection();
            ShipHubLP.initSmoothScrolling();
        },

        initUserDashboard() {
            // 求職者認証チェック
            if (!ShipHubAuth.requireAuth('求職者', 'user-login.html')) {
                return;
            }

            this.initJobListing();
            this.initApplicationForm();
        },

        initCompanyDashboard() {
            // 企業認証チェック
            if (!ShipHubAuth.requireAuth('企業', 'company-login.html')) {
                return;
            }

            this.initJobPostingForm();
        },

        initAuthPages() {
            this.initAuthForms();
        },

        // 求人一覧初期化
        async initJobListing() {
            const jobsList = document.getElementById('jobsList');
            const jobCount = document.getElementById('jobCount');
            const loadingMessage = document.getElementById('loadingMessage');
            const errorMessage = document.getElementById('errorMessage');

            if (!jobsList) return;

            try {
                const jobs = await ShipHubJobs.fetchJobs();
                loadingMessage.style.display = 'none';
                if (jobCount) jobCount.textContent = jobs.length;
                jobsList.innerHTML = jobs.map(ShipHubJobs.createJobCard).join('');
            } catch (error) {
                if (errorMessage) {
                    errorMessage.textContent = '求人データの取得に失敗しました。';
                    errorMessage.style.display = 'block';
                }
                loadingMessage.style.display = 'none';
            }
        },

        // 応募フォーム初期化
        initApplicationForm() {
            const jobsList = document.getElementById('jobsList');
            const applicationForm = document.getElementById('application-form');
            const jobListSection = document.getElementById('job-list-section');
            const applicationSection = document.getElementById('application-section');

            if (!jobsList || !applicationForm) return;

            // 求人カードクリックで応募フォーム表示
            jobsList.addEventListener('click', (e) => {
                const card = e.target.closest('.job-card');
                if (card && e.target.classList.contains('apply-btn')) {
                    const jobData = JSON.parse(card.getAttribute('data-job'));
                    this.showApplicationForm(jobData);
                }
            });

            // 応募フォーム送信
            applicationForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleApplicationSubmit(e);
            });
        },

        showApplicationForm(jobData) {
            const selectedJobCard = document.getElementById('selected-job-card');
            const jobListSection = document.getElementById('job-list-section');
            const applicationSection = document.getElementById('application-section');
            const applicationForm = document.getElementById('application-form');

            if (selectedJobCard) {
                selectedJobCard.querySelector('.company').textContent = jobData.company || '企業名未設定';
                selectedJobCard.querySelector('.position').textContent = jobData.position || '職種未設定';
            }

            if (applicationForm) {
                applicationForm.dataset.jobId = jobData.jobId || '';
                applicationForm.dataset.company = jobData.company || '';
                applicationForm.dataset.position = jobData.position || '';
            }

            if (jobListSection) jobListSection.style.display = 'none';
            if (applicationSection) applicationSection.style.display = 'block';
        },

        async handleApplicationSubmit(e) {
            const form = e.target;
            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value.trim();
            const message = document.getElementById('message').value.trim();
            const applyBtn = document.getElementById('apply-btn');
            const successMessage = document.getElementById('success-message');
            const errorMessage = document.getElementById('error-message');

            if (!name || !email || !message) {
                alert('すべての項目を入力してください。');
                return;
            }

            const jobData = {
                company: form.dataset.company,
                position: form.dataset.position,
                jobId: form.dataset.jobId
            };

            if (applyBtn) {
                applyBtn.disabled = true;
                applyBtn.textContent = '応募中...';
            }

            try {
                await ShipHubJobs.recordApplication(jobData, name, email, message);
                if (successMessage) successMessage.style.display = 'block';
                form.reset();
                
                setTimeout(() => {
                    const jobListSection = document.getElementById('job-list-section');
                    const applicationSection = document.getElementById('application-section');
                    if (applicationSection) applicationSection.style.display = 'none';
                    if (jobListSection) jobListSection.style.display = 'block';
                }, 2000);
            } catch (error) {
                if (errorMessage) {
                    errorMessage.textContent = 'エラーが発生しました。もう一度お試しください。';
                    errorMessage.style.display = 'block';
                }
            } finally {
                if (applyBtn) {
                    applyBtn.disabled = false;
                    applyBtn.textContent = '応募する';
                }
            }
        },

        // 求人投稿フォーム初期化
        initJobPostingForm() {
            const form = document.getElementById('post-job-form');
            const previewBtn = document.getElementById('preview-btn');

            if (!form) return;

            // バリデーション
            document.querySelectorAll('.form-input, .form-select, .form-textarea').forEach(el => {
                el.addEventListener('input', () => this.validateJobForm());
            });

            // プレビュー
            if (previewBtn) {
                previewBtn.addEventListener('click', () => this.showJobPreview());
            }

            // フォーム送信
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleJobSubmit(e);
            });
        },

        validateJobForm() {
            let valid = true;
            const requiredFields = [
                {id: 'company', error: 'company-error'},
                {id: 'position', error: 'position-error'},
                {id: 'region', error: 'region-error'},
                {id: 'location', error: 'location-error'},
                {id: 'salary', error: 'salary-error'},
                {id: 'status', error: 'status-error'}
            ];

            requiredFields.forEach(f => {
                const element = document.getElementById(f.id);
                const errorElement = document.getElementById(f.error);
                if (!element || !errorElement) return;

                const value = element.value.trim();
                if (!value) {
                    errorElement.style.display = 'block';
                    valid = false;
                } else {
                    errorElement.style.display = 'none';
                }
            });

            return valid;
        },

        showJobPreview() {
            if (!this.validateJobForm()) return;

            const preview = document.getElementById('preview-card');
            if (!preview) return;

            const get = id => {
                const element = document.getElementById(id);
                return element ? element.value.trim() : '';
            };

            preview.innerHTML = `
                <div class="preview-title">プレビュー</div>
                <div class="preview-row"><b>企業名:</b> ${get('company')}</div>
                <div class="preview-row"><b>職種:</b> ${get('position')}</div>
                <div class="preview-row"><b>地域:</b> ${get('region')}</div>
                <div class="preview-row"><b>勤務地:</b> ${get('location')}</div>
                <div class="preview-row"><b>年収:</b> ${get('salary')}万円</div>
                <div class="preview-row"><b>応募ステータス:</b> ${get('status')}</div>
            `;
            preview.style.display = 'block';
        },

        async handleJobSubmit(e) {
            const form = e.target;
            const successMessage = document.getElementById('success-message');
            const errorMessage = document.getElementById('error-message');

            if (!this.validateJobForm()) return;

            const get = id => {
                const element = document.getElementById(id);
                return element ? element.value.trim() : '';
            };

            const jobData = {
                '企業名': get('company'),
                '職種': get('position'),
                '地域': get('region'),
                '勤務地': get('location'),
                '年収': Number(get('salary')),
                '応募ステータス': get('status')
            };

            try {
                await ShipHubJobs.postJob(jobData);
                if (successMessage) successMessage.style.display = 'block';
                form.reset();
            } catch (error) {
                if (errorMessage) {
                    errorMessage.textContent = 'エラーが発生しました。もう一度お試しください。';
                    errorMessage.style.display = 'block';
                }
            }
        },

        // 認証フォーム初期化
        initAuthForms() {
            // ログインフォーム
            const loginForm = document.getElementById('loginForm');
            if (loginForm) {
                loginForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    await this.handleLogin(e);
                });
            }

            // 求職者登録フォーム
            const userRegisterForm = document.getElementById('userRegisterForm');
            if (userRegisterForm) {
                userRegisterForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    await this.handleUserRegister(e);
                });
            }

            // 企業登録フォーム
            const companyRegisterForm = document.getElementById('companyRegisterForm');
            if (companyRegisterForm) {
                companyRegisterForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    await this.handleCompanyRegister(e);
                });
            }
        },

        async handleLogin(e) {
            const form = e.target;
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const userType = form.dataset.userType; // 'user' or 'company'
            const expectedUserType = userType === 'company' ? '企業' : '求職者';
            
            // UI要素取得
            const submitBtn = form.querySelector('button[type="submit"]');
            const messageContainer = document.getElementById('messageContainer');
            
            // 高速ローディング状態
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="loading-dots">認証中</span>';
            }
            
            if (messageContainer) {
                messageContainer.innerHTML = '';
            }

            try {
                // 高速認証実行
                const result = await ShipHubAuth.authenticate(email, password, expectedUserType);

                if (result.success) {
                    // 成功フィードバック
                    if (submitBtn) {
                        submitBtn.innerHTML = '✅ ログイン成功';
                        submitBtn.style.background = '#48bb78';
                    }
                    
                    // 即座にリダイレクト
                    setTimeout(() => {
                        ShipHubAuth.redirectAfterLogin(expectedUserType);
                    }, 200);
                } else {
                    throw new Error(result.error);
                }
            } catch (error) {
                // エラー表示
                if (messageContainer) {
                    messageContainer.innerHTML = `<div class="error-message">${ShipHubAuth.getErrorMessage(error.message || error)}</div>`;
                }
                
                // ボタン復元
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = 'ログイン';
                    submitBtn.style.background = '';
                }
            }
        },

        async handleUserRegister(e) {
            const form = e.target;
            const formData = {
                lastName: document.getElementById('lastName').value,
                firstName: document.getElementById('firstName').value,
                email: document.getElementById('email').value,
                password: document.getElementById('password').value,
                confirmPassword: document.getElementById('confirmPassword').value,
                phone: document.getElementById('phone').value
            };

            if (formData.password !== formData.confirmPassword) {
                const messageContainer = document.getElementById('messageContainer');
                if (messageContainer) {
                    messageContainer.innerHTML = '<div class="error-message">パスワードが一致しません</div>';
                }
                return;
            }

            const result = await ShipHubAuth.registerUser(formData);

            if (result.success) {
                ShipHubAuth.redirectAfterLogin('求職者');
            } else {
                const messageContainer = document.getElementById('messageContainer');
                if (messageContainer) {
                    messageContainer.innerHTML = `<div class="error-message">${ShipHubAuth.getErrorMessage(result.error)}</div>`;
                }
            }
        },

        async handleCompanyRegister(e) {
            const form = e.target;
            const formData = {
                companyName: document.getElementById('companyName').value,
                email: document.getElementById('email').value,
                password: document.getElementById('password').value,
                confirmPassword: document.getElementById('confirmPassword').value,
                phone: document.getElementById('phone').value
            };

            if (formData.password !== formData.confirmPassword) {
                const messageContainer = document.getElementById('messageContainer');
                if (messageContainer) {
                    messageContainer.innerHTML = '<div class="error-message">パスワードが一致しません</div>';
                }
                return;
            }

            const result = await ShipHubAuth.registerCompany(formData);

            if (result.success) {
                ShipHubAuth.redirectAfterLogin('企業');
            } else {
                const messageContainer = document.getElementById('messageContainer');
                if (messageContainer) {
                    messageContainer.innerHTML = `<div class="error-message">${ShipHubAuth.getErrorMessage(result.error)}</div>`;
                }
            }
        }
    };

    // =============================================================================
    // 初期化実行
    // =============================================================================
    
    // DOMContentLoadedで初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ShipHubApp.init());
    } else {
        ShipHubApp.init();
    }

    // レガシー関数のエクスポート（下位互換性のため）
    window.authenticateUser = ShipHubAuth.authenticate.bind(ShipHubAuth);
    window.registerUser = ShipHubAuth.registerUser.bind(ShipHubAuth);
    window.registerCompany = ShipHubAuth.registerCompany.bind(ShipHubAuth);

})();