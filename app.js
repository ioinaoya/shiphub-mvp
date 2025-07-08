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
            APPLICATION_TABLE: '応募履歴',
            BOOKMARKS_TABLE: 'お気に入り'
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
            COMPANY_HOME: 'company.html',
            USER_HOME: 'job-request.html',
            COMPANY_LOGIN: 'login.html',
            USER_LOGIN: 'login.html'
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
                    userName: userData.fields['氏名'] || null,
                    jobTitle: userData.fields['職種'] || userData.fields['役職'] || null,
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
                    '氏名': this.security.sanitizeInput(formData.name || `${formData.lastName || ''} ${formData.firstName || ''}`)
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
                '企業': 'company.html',
                '求職者': 'job-request.html'
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
            const salary = fields.年収 ? `${fields.年収}` : '要相談';
            const status = fields.応募ステータス || '募集中';
            const workType = fields.勤務形態 || '正社員';
            const company = fields.企業名 || '企業名未設定';
            const position = fields.職種 || '職種未設定';
            const location = fields.勤務地 || '未設定';
            const region = fields.地域 || '未設定';
            
            // 企業名の最初の文字を取得（アイコン用）
            const companyInitial = company.charAt(0);
            
            // ステータスに応じたタグスタイル
            const getStatusTag = (status) => {
                switch(status) {
                    case '急募': return '<span class="job-tag" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);">急募</span>';
                    case '募集中': return '<span class="job-tag" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">募集中</span>';
                    case '募集停止': return '<span class="job-tag" style="background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);">募集停止</span>';
                    default: return '<span class="job-tag">募集中</span>';
                }
            };
            
            // 職種に応じたアイコン
            const getPositionIcon = (position) => {
                if (position.includes('船') || position.includes('航海')) return 'ship';
                if (position.includes('機関') || position.includes('エンジン')) return 'cog';
                if (position.includes('港湾') || position.includes('港')) return 'anchor';
                if (position.includes('管理') || position.includes('マネージャー')) return 'users';
                if (position.includes('技術') || position.includes('エンジニア')) return 'wrench';
                return 'briefcase';
            };
            
            return `
                <div class="job-card bg-white rounded-2xl shadow-lg p-6 cursor-pointer hover:shadow-xl transition-all duration-300" data-job='${JSON.stringify({
                    jobId: job.id,
                    position: position,
                    company: company,
                    email: fields.メールアドレス || '',
                    region: region,
                    location: location,
                    salary: fields.年収 || '',
                    workType: workType,
                    status: status
                })}'>
                    <!-- ヘッダー部分 -->
                    <div class="flex items-start justify-between mb-4">
                        <div class="flex items-start space-x-4">
                            <div class="company-icon">
                                ${companyInitial}
                            </div>
                            <div class="flex-1">
                                <h3 class="job-title text-xl font-bold text-navy-900 mb-1">${position}</h3>
                                <p class="job-company text-ocean-600 font-semibold text-lg">${company}</p>
                            </div>
                        </div>
                        ${getStatusTag(status)}
                    </div>
                    
                    <!-- 勤務情報 -->
                    <div class="grid grid-cols-2 gap-3 mb-4">
                        <div class="job-info-item flex items-center space-x-2">
                            <i data-lucide="map-pin" class="w-4 h-4 text-ocean-600"></i>
                            <span class="text-sm text-navy-700 job-location">${location}</span>
                        </div>
                        <div class="job-info-item flex items-center space-x-2">
                            <i data-lucide="clock" class="w-4 h-4 text-ocean-600"></i>
                            <span class="text-sm text-navy-700">${workType}</span>
                        </div>
                        <div class="job-info-item flex items-center space-x-2">
                            <i data-lucide="map" class="w-4 h-4 text-ocean-600"></i>
                            <span class="text-sm text-navy-700">${region}</span>
                        </div>
                        <div class="job-info-item flex items-center space-x-2">
                            <i data-lucide="${getPositionIcon(position)}" class="w-4 h-4 text-ocean-600"></i>
                            <span class="text-sm text-navy-700">海事業界</span>
                        </div>
                    </div>
                    
                    <!-- 年収ハイライト -->
                    <div class="salary-highlight mb-4">
                        <div class="flex items-center justify-center space-x-2">
                            <i data-lucide="banknote" class="w-5 h-5"></i>
                            <span class="text-lg">年収 ${salary}${salary !== '要相談' ? '万円' : ''}</span>
                        </div>
                    </div>
                    
                    <!-- 求人の詳細説明（もしあれば） -->
                    ${fields.仕事内容 ? `
                        <div class="bg-gray-50 rounded-lg p-3 mb-4">
                            <p class="text-sm text-navy-600 line-clamp-2">${fields.仕事内容.substring(0, 80)}${fields.仕事内容.length > 80 ? '...' : ''}</p>
                        </div>
                    ` : ''}
                    
                    <!-- アクションボタン -->
                    <div class="flex space-x-3">
                        <button class="apply-btn flex-1 bg-ocean-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-ocean-700 transition-all duration-300 flex items-center justify-center space-x-2">
                            <i data-lucide="send" class="w-4 h-4"></i>
                            <span>応募する</span>
                        </button>
                        <button class="flex items-center justify-center w-12 h-12 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors duration-300">
                            <i data-lucide="bookmark" class="w-5 h-5 text-navy-600"></i>
                        </button>
                    </div>
                </div>
            `;
        },

        // 応募記録
        async recordApplication({company, position, jobId, email: companyEmail}, name, email, message) {
            try {
                // 現在のユーザーIDを取得
                const currentUser = ShipHubAuth.getCurrentUser();
                const userId = currentUser ? currentUser.id : '';
                
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
                                ...(companyEmail ? { '企業メールアドレス': companyEmail } : {})
                            }}
                        ]
                    })
                });
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    console.error('Airtable field validation error:', errorData);
                    console.error('Submitted data:', {
                        '会社名': company,
                        '職種': position,
                        '名前': name,
                        'メールアドレス': email,
                        '自己紹介': message,
                        ...(companyEmail ? { '企業メールアドレス': companyEmail } : {})
                    });
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return true;
            } catch (error) {
                // CORS対応
                if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
                    try {
                        const currentUser = ShipHubAuth.getCurrentUser();
                        const userId = currentUser ? currentUser.id : '';
                        
                        const proxyResponse = await fetch(`${CONFIG.PROXY_URL}https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.APPLICATION_TABLE)}`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${CONFIG.API.TOKEN}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                records: [{ fields: {
                                    '会社名': company, '職種': position, '名前': name,
                                    'メールアドレス': email, '自己紹介': message,
                                    ...(companyEmail ? { '企業メールアドレス': companyEmail } : {})
                                }}]
                            })
                        });
                        if (!proxyResponse.ok) {
                            const errorData = await proxyResponse.json().catch(() => ({}));
                            console.error('Proxy Airtable field validation error:', errorData);
                            throw new Error('PROXY_ERROR');
                        }
                        return true;
                    } catch (proxyError) {
                        console.error('CORS proxy error:', proxyError);
                        throw new Error('CORS_ERROR');
                    }
                }
                throw error;
            }
        },

        // 求人投稿（統合版）
        async postJob(jobData) {
            // データ検証
            if (!jobData.company || !jobData.position || !jobData.region || !jobData.location) {
                console.error('Missing required fields:', {
                    company: !jobData.company,
                    position: !jobData.position,
                    region: !jobData.region,
                    location: !jobData.location
                });
                
                throw new Error('MISSING_REQUIRED_FIELDS');
            }
            
            // デバッグログ
            console.log('Submitting job data to Airtable:', jobData);
            
            try {
                const response = await fetch(`https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.JOBS_TABLE)}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${CONFIG.API.TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        records: [{
                            fields: {
                                '職種': jobData.position,     // 修正されたマッピング
                                '企業名': jobData.company,    // 修正されたマッピング
                                'メールアドレス': jobData.email,
                                '地域': jobData.region,
                                '勤務地': jobData.location,
                                '年収': jobData.salary ? parseInt(jobData.salary) : 0,
                                '勤務形態': jobData.workType,
                                '詳細': jobData.detail,       // 修正されたマッピング
                                '必要な資格・経験': jobData.requirement,
                                '応募ステータス': '募集中'
                            }
                        }]
                    })
                });
                
                console.log('Airtable API response status:', response.status);
                
                if (response.ok) {
                    const result = await response.json();
                    console.log('Job posted successfully:', result);
                    return { success: true };
                } else {
                    let errorData;
                    try {
                        errorData = await response.json();
                    } catch (e) {
                        errorData = { error: { message: 'Response parsing error' } };
                    }
                    console.error('Airtable API error:', errorData, 'Status:', response.status);
                    
                    // 422エラー時の詳細エラーメッセージ
                    if (response.status === 422) {
                        if (errorData.error && errorData.error.message) {
                            if (errorData.error.message.includes('field')) {
                                throw new Error('FIELD_ERROR: Airtableのフィールド構造と一致しない項目があります。');
                            } else if (errorData.error.message.includes('Invalid')) {
                                throw new Error('INVALID_DATA: 入力データに問題があります。必須項目を確認してください。');
                            } else {
                                throw new Error(`AIRTABLE_ERROR: ${errorData.error.message}`);
                            }
                        } else {
                            throw new Error('UNKNOWN_422_ERROR: 不明な422エラーが発生しました。');
                        }
                    }
                    
                    throw new Error(`HTTP_ERROR: Status ${response.status}`);
                }
            } catch (error) {
                console.error('Network or processing error:', error);
                
                if (error.message.includes('fetch')) {
                    throw new Error('NETWORK_ERROR: ネットワークエラーが発生しました。インターネット接続を確認してください。');
                } else if (error.message.startsWith('FIELD_ERROR') || 
                          error.message.startsWith('INVALID_DATA') || 
                          error.message.startsWith('AIRTABLE_ERROR') ||
                          error.message.startsWith('MISSING_REQUIRED_FIELDS') ||
                          error.message.startsWith('UNKNOWN_422_ERROR') ||
                          error.message.startsWith('HTTP_ERROR')) {
                    // 既に適切にフォーマットされたエラーはそのまま投げる
                    throw error;
                } else {
                    throw new Error('UNEXPECTED_ERROR: 予期しないエラーが発生しました。しばらくしてから再度お試しください。');
                }
            }
        },
        
        // エラーメッセージ取得
        getJobPostErrorMessage(errorMessage) {
            if (errorMessage.includes('MISSING_REQUIRED_FIELDS')) {
                return '必須項目が入力されていません。企業名、職種、地域、勤務地を入力してください。';
            } else if (errorMessage.includes('FIELD_ERROR')) {
                return 'フィールドエラー: Airtableのフィールド構造と一致しない項目があります。管理者にお問い合わせください。';
            } else if (errorMessage.includes('INVALID_DATA')) {
                return '入力データに問題があります。必須項目を確認して再度お試しください。';
            } else if (errorMessage.includes('NETWORK_ERROR')) {
                return 'ネットワークエラーが発生しました。インターネット接続を確認して再度お試しください。';
            } else if (errorMessage.includes('AIRTABLE_ERROR')) {
                return errorMessage.split(': ')[1] || 'Airtableでエラーが発生しました。';
            } else {
                return '予期しないエラーが発生しました。しばらくしてから再度お試しください。';
            }
        }
    };

    // =============================================================================
    // データ管理システム（ダッシュボード・応募履歴・お気に入り）
    // =============================================================================
    
    const ShipHubData = {
        // ダッシュボード統計取得
        async getDashboardStats(userId) {
            try {
                if (!userId) {
                    return {
                        applying: 0,
                        documentPassed: 0,
                        bookmarked: 0,
                        profileCompletion: 85
                    };
                }
                
                // 応募履歴を取得してカウント - ユーザーIDで検索
                const applicationsUrl = `https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.APPLICATION_TABLE)}?filterByFormula=${encodeURIComponent(`{ユーザーID}='${userId}'`)}`;
                const applicationsResponse = await fetch(applicationsUrl, {
                    headers: { 
                        'Authorization': `Bearer ${CONFIG.API.TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                // お気に入りは後で実装（まずは応募履歴のみ）
                let bookmarks = [];
                try {
                    const bookmarksUrl = `https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.BOOKMARKS_TABLE)}?filterByFormula=${encodeURIComponent(`{ユーザーID}='${userId}'`)}`;
                    const bookmarksResponse = await fetch(bookmarksUrl, {
                        headers: { 
                            'Authorization': `Bearer ${CONFIG.API.TOKEN}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (bookmarksResponse.ok) {
                        const bookmarksData = await bookmarksResponse.json();
                        bookmarks = bookmarksData.records || [];
                    }
                } catch (bookmarkError) {
                    console.warn('Bookmarks table not accessible:', bookmarkError);
                    bookmarks = [];
                }
                
                const applications = applicationsResponse.ok ? (await applicationsResponse.json()).records : [];
                
                // ステータス別集計
                const statusCounts = {
                    applying: 0,
                    documentPassed: 0,
                    bookmarked: bookmarks.length,
                    profileCompletion: 85 // 固定値（将来的にプロフィール完成度を計算）
                };
                
                applications.forEach(app => {
                    const status = app.fields['ステータス'] || '応募中';
                    if (status.includes('応募') || status === '新規') {
                        statusCounts.applying++;
                    } else if (status.includes('書類通過') || status.includes('面接')) {
                        statusCounts.documentPassed++;
                    }
                });
                
                return statusCounts;
            } catch (error) {
                console.error('Error fetching dashboard stats:', error);
                return {
                    applying: 0,
                    documentPassed: 0,
                    bookmarked: 0,
                    profileCompletion: 85
                };
            }
        },

        // 応募履歴取得
        async getApplicationHistory(userId) {
            try {
                if (!userId) return [];
                
                const response = await fetch(`https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.APPLICATION_TABLE)}?filterByFormula=${encodeURIComponent(`{ユーザーID}='${userId}'`)}&sort[0][field]=${encodeURIComponent('応募日')}&sort[0][direction]=desc`, {
                    headers: { 'Authorization': `Bearer ${CONFIG.API.TOKEN}` }
                });
                
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const data = await response.json();
                return data.records.map(record => ({
                    id: record.id,
                    company: record.fields['会社名'] || '企業名未設定',
                    position: record.fields['職種'] || '職種未設定',
                    applicationDate: record.fields['応募日'] || new Date().toISOString().split('T')[0],
                    status: record.fields['ステータス'] || '応募中',
                    message: record.fields['自己紹介'] || ''
                }));
            } catch (error) {
                console.error('Error fetching application history:', error);
                return [];
            }
        },

        // お気に入り取得
        async getBookmarks(userId) {
            try {
                if (!userId) return [];
                
                const response = await fetch(`https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.BOOKMARKS_TABLE)}?filterByFormula=${encodeURIComponent(`{ユーザーID}='${userId}'`)}&sort[0][field]=${encodeURIComponent('登録日時')}&sort[0][direction]=desc`, {
                    headers: { 'Authorization': `Bearer ${CONFIG.API.TOKEN}` }
                });
                
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const data = await response.json();
                return data.records.map(record => ({
                    id: record.id,
                    jobId: record.fields['求人ID'],
                    bookmarkDate: record.fields['登録日時'] || new Date().toISOString().split('T')[0]
                }));
            } catch (error) {
                console.error('Error fetching bookmarks:', error);
                return [];
            }
        },

        // お気に入り追加
        async addBookmark(userId, jobId) {
            try {
                const response = await fetch(`https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.BOOKMARKS_TABLE)}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${CONFIG.API.TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        records: [{
                            fields: {
                                'ユーザーID': userId,
                                '求人ID': jobId,
                                '登録日時': new Date().toISOString().split('T')[0]
                            }
                        }]
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    console.error('Bookmark API error:', errorData);
                    console.error('Submitted bookmark data:', {
                        'ユーザーID': userId,
                        '求人ID': jobId,
                        '登録日時': new Date().toISOString().split('T')[0]
                    });
                    throw new Error(`HTTP ${response.status}`);
                }
                return await response.json();
            } catch (error) {
                console.error('Error adding bookmark:', error);
                throw error;
            }
        },

        // お気に入り削除
        async removeBookmark(userId, jobId) {
            try {
                if (!userId || !jobId) throw new Error('Missing required parameters');
                
                // まず該当のお気に入りレコードを検索
                const searchResponse = await fetch(`https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.BOOKMARKS_TABLE)}?filterByFormula=${encodeURIComponent(`AND({ユーザーID}='${userId}',{求人ID}='${jobId}')`)}`, {
                    headers: { 'Authorization': `Bearer ${CONFIG.API.TOKEN}` }
                });
                
                if (!searchResponse.ok) throw new Error(`HTTP ${searchResponse.status}`);
                
                const searchData = await searchResponse.json();
                if (searchData.records.length === 0) {
                    throw new Error('Bookmark not found');
                }
                
                // レコードを削除
                const recordId = searchData.records[0].id;
                const deleteResponse = await fetch(`https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.BOOKMARKS_TABLE)}/${recordId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${CONFIG.API.TOKEN}` }
                });
                
                if (!deleteResponse.ok) throw new Error(`HTTP ${deleteResponse.status}`);
                return await deleteResponse.json();
            } catch (error) {
                console.error('Error removing bookmark:', error);
                throw error;
            }
        },

        // お気に入りチェック
        async isBookmarked(userId, jobId) {
            try {
                if (!userId || !jobId) return false;
                
                const response = await fetch(`https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.BOOKMARKS_TABLE)}?filterByFormula=${encodeURIComponent(`AND({ユーザーID}='${userId}',{求人ID}='${jobId}')`)}`, {
                    headers: { 'Authorization': `Bearer ${CONFIG.API.TOKEN}` }
                });
                
                if (!response.ok) return false;
                
                const data = await response.json();
                return data.records.length > 0;
            } catch (error) {
                console.error('Error checking bookmark:', error);
                return false;
            }
        },

        // 企業の応募者管理用データ取得
        async getCompanyApplications(companyName) {
            try {
                if (!companyName) return [];
                
                const response = await fetch(`https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.APPLICATION_TABLE)}?filterByFormula=${encodeURIComponent(`{会社名}='${companyName}'`)}&sort[0][field]=${encodeURIComponent('Created time')}&sort[0][direction]=desc`, {
                    headers: { 'Authorization': `Bearer ${CONFIG.API.TOKEN}` }
                });
                
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const data = await response.json();
                return data.records.map(record => ({
                    id: record.id,
                    name: record.fields['名前'] || '名前未設定',
                    email: record.fields['メールアドレス'] || '',
                    position: record.fields['職種'] || '職種未設定',
                    applicationDate: record.createdTime ? record.createdTime.split('T')[0] : new Date().toISOString().split('T')[0],
                    status: '新規応募',
                    message: record.fields['自己紹介'] || '',
                    companyEmail: record.fields['企業メールアドレス'] || ''
                }));
            } catch (error) {
                console.error('Error fetching company applications:', error);
                return [];
            }
        },

        // 企業の求人管理用データ取得
        async getCompanyJobs(companyName) {
            try {
                if (!companyName) return [];
                
                const response = await fetch(`https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.JOBS_TABLE)}?filterByFormula=${encodeURIComponent(`{企業名}='${companyName}'`)}&sort[0][field]=${encodeURIComponent('Created time')}&sort[0][direction]=desc`, {
                    headers: { 'Authorization': `Bearer ${CONFIG.API.TOKEN}` }
                });
                
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const data = await response.json();
                return data.records.map(record => ({
                    id: record.id,
                    position: record.fields['職種'] || '職種未設定',
                    location: record.fields['勤務地'] || '勤務地未設定',
                    region: record.fields['地域'] || '地域未設定',
                    salary: record.fields['年収'] || 0,
                    workType: record.fields['勤務形態'] || '正社員',
                    status: record.fields['応募ステータス'] || '募集中',
                    email: record.fields['メールアドレス'] || '',
                    detail: record.fields['詳細'] || '',
                    requirement: record.fields['必要な資格・経験'] || '',
                    viewCount: record.fields['閲覧数'] || 0,
                    applicantCount: 0,
                    createdDate: record.createdTime ? record.createdTime.split('T')[0] : new Date().toISOString().split('T')[0]
                }));
            } catch (error) {
                console.error('Error fetching company jobs:', error);
                return [];
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
        },

        // 料金プラン機能初期化
        initPricingSection() {
            const planData = {
                startup: {
                    name: 'スタートアップ・個人事業主',
                    price: 5000,
                    successFee: '5%',
                    features: [
                        '求人掲載数：2件まで',
                        'AIスカウト機能：月5名まで',
                        '基本的な応募管理機能',
                        'メールサポート'
                    ]
                },
                small: {
                    name: '中小企業',
                    price: 15000,
                    successFee: '5-6%',
                    features: [
                        '求人掲載数：5件まで',
                        'AIスカウト機能：月20名まで',
                        '自社紹介ページ作成機能',
                        '応募者管理ダッシュボード',
                        'チャットサポート'
                    ]
                },
                medium: {
                    name: '中堅企業',
                    price: 30000,
                    successFee: '6-7%',
                    features: [
                        '求人掲載数：10件まで',
                        'AIスカウト機能：月50名まで',
                        '優先表示オプション',
                        '応募者データ分析機能',
                        '電話サポート',
                        'API連携（基本）'
                    ]
                },
                large: {
                    name: '大企業',
                    price: 50000,
                    successFee: '7-8%',
                    features: [
                        '求人掲載数：無制限',
                        'AIスカウト機能：無制限',
                        '全機能利用可能',
                        '専任サポート',
                        'API連携（カスタム対応）',
                        'カスタマイズ相談可能'
                    ]
                }
            };

            let selectedPlan = null;

            // 企業規模ボタンのクリックイベント
            document.querySelectorAll('.company-size-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    // アクティブ状態の更新
                    document.querySelectorAll('.company-size-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');

                    // プラン詳細を表示
                    selectedPlan = this.dataset.size;
                    const plan = planData[selectedPlan];
                    
                    document.getElementById('plan-details').classList.remove('hidden');
                    document.getElementById('monthly-price').textContent = plan.price.toLocaleString();
                    document.getElementById('success-fee').textContent = plan.successFee;

                    // 機能リストを更新
                    const featuresHtml = plan.features.map(feature => `
                        <li class="flex items-center">
                            <i data-lucide="check-circle" class="w-5 h-5 text-ocean-600 mr-3 flex-shrink-0"></i>
                            <span class="text-navy-700">${feature}</span>
                        </li>
                    `).join('');
                    document.getElementById('plan-features').innerHTML = featuresHtml;

                    // Lucideアイコンを再初期化
                    if (window.lucide) {
                        window.lucide.createIcons();
                    }

                    // 料金シミュレーターを更新
                    updatePriceSimulator();
                });
            });

            // 料金シミュレーター
            function updatePriceSimulator() {
                if (!selectedPlan) return;

                const plan = planData[selectedPlan];
                const hiringCount = parseInt(document.getElementById('hiring-count').value) || 0;
                const avgSalary = parseInt(document.getElementById('average-salary').value) || 0;

                // 成功報酬率を計算（範囲の中間値を使用）
                let successFeeRate = 0.065; // デフォルト6.5%
                switch(selectedPlan) {
                    case 'startup': successFeeRate = 0.05; break;
                    case 'small': successFeeRate = 0.055; break;
                    case 'medium': successFeeRate = 0.065; break;
                    case 'large': successFeeRate = 0.075; break;
                }

                // 年間費用計算
                const monthlyFee = plan.price * 12;
                const successFee = hiringCount * avgSalary * 10000 * successFeeRate;
                const annualCost = monthlyFee + successFee;

                document.getElementById('annual-cost').textContent = Math.floor(annualCost).toLocaleString();
            }

            // 入力フィールドの変更イベント
            document.getElementById('hiring-count')?.addEventListener('input', updatePriceSimulator);
            document.getElementById('average-salary')?.addEventListener('change', updatePriceSimulator);
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
            const filename = path.split('/').pop() || 'job-request.html';
            
            if (filename === 'LP.html') return 'landing';
            if (filename === 'job-request.html') return 'user-dashboard';
            if (filename === 'company.html') return 'company-dashboard';
            if (filename === 'login.html' || filename === 'jobseeker-login.html' || filename === 'company-login.html' || filename.includes('register')) return 'auth';
            
            return 'unknown';
        },

        initCommonFeatures() {
            // グローバル認証機能
            window.ShipHubAuth = ShipHubAuth;
            window.requireAuth = ShipHubAuth.requireAuth.bind(ShipHubAuth);
            window.logout = ShipHubAuth.logout.bind(ShipHubAuth);
            
            // グローバルデータ管理機能
            window.ShipHubData = ShipHubData;
        },

        initLandingPage() {
            ShipHubLP.initScrollAnimations();
            ShipHubLP.initCounterAnimations();
            ShipHubLP.initFAQSection();
            ShipHubLP.initSmoothScrolling();
            ShipHubLP.initPricingSection();
            
            // Lucideアイコンの初期化
            if (window.lucide) {
                window.lucide.createIcons();
            }
        },

        initUserDashboard() {
            // 求職者認証チェック
            if (!ShipHubAuth.requireAuth('求職者', 'login.html')) {
                return;
            }

            this.initJobListing();
            this.initApplicationForm();
        },

        initCompanyDashboard() {
            // 企業認証チェック
            if (!ShipHubAuth.requireAuth('企業', 'login.html')) {
                return;
            }

            this.initJobPostingForm();
            this.initCompanyDataManagement();
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
                const companyElement = selectedJobCard.querySelector('.company');
                const positionElement = selectedJobCard.querySelector('.position');
                
                if (companyElement) {
                    companyElement.textContent = jobData.company || '企業名未設定';
                }
                if (positionElement) {
                    positionElement.textContent = jobData.position || '職種未設定';
                }
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

        // 求人投稿フォーム初期化（統合版）
        initJobPostingForm() {
            const form = document.getElementById('post-job-form');
            const previewBtn = document.getElementById('preview-btn');

            if (!form) return;

            // バリデーション
            document.querySelectorAll('.form-input, .form-select, .form-textarea').forEach(el => {
                el.addEventListener('input', () => this.validateJobForm());
            });

            // プレビュー機能
            if (previewBtn) {
                previewBtn.addEventListener('click', () => this.showJobPreview());
            }

            // フォーム送信（統合版）
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleJobSubmit(e);
            });
        },

        validateJobForm() {
            let valid = true;
            const requiredFields = [
                {id: 'company', error: 'company-error'},
                {id: 'email', error: 'email-error'},
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
            // フォームデータを取得
            const form = document.getElementById('post-job-form');
            const formData = new FormData(form);
            
            const previewData = {
                company: formData.get('company') || '未入力',
                position: formData.get('position') || '未入力',
                region: formData.get('region') || '未選択',
                location: formData.get('location') || '未入力',
                salary: formData.get('salary') ? `${formData.get('salary')}万円` : '未入力',
                workType: formData.get('workType') || '未選択',
                detail: formData.get('detail') || '未入力',
                requirement: formData.get('requirement') || '未入力'
            };
            
            // プレビューコンテンツを作成
            const previewContent = `
                <div class="bg-white rounded-xl shadow-lg p-6 max-w-2xl mx-auto">
                    <h3 class="text-2xl font-bold text-navy-900 mb-4">${previewData.position}</h3>
                    <p class="text-lg text-navy-700 mb-4">${previewData.company}</p>
                    
                    <div class="space-y-3 mb-6">
                        <div class="flex items-center space-x-2 text-navy-600">
                            <i data-lucide="map-pin" class="w-5 h-5"></i>
                            <span>${previewData.region} - ${previewData.location}</span>
                        </div>
                        <div class="flex items-center space-x-2 text-navy-600">
                            <i data-lucide="banknote" class="w-5 h-5"></i>
                            <span>年収: ${previewData.salary}</span>
                        </div>
                        <div class="flex items-center space-x-2 text-navy-600">
                            <i data-lucide="briefcase" class="w-5 h-5"></i>
                            <span>${previewData.workType}</span>
                        </div>
                    </div>
                    
                    <div class="border-t pt-4 mb-4">
                        <h4 class="font-semibold text-navy-900 mb-2">仕事内容</h4>
                        <p class="text-navy-700 whitespace-pre-wrap">${previewData.detail}</p>
                    </div>
                    
                    <div class="border-t pt-4">
                        <h4 class="font-semibold text-navy-900 mb-2">必要な資格・経験</h4>
                        <p class="text-navy-700 whitespace-pre-wrap">${previewData.requirement}</p>
                    </div>
                </div>
            `;
            
            // モーダルを作成
            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
            modal.innerHTML = `
                <div class="bg-white rounded-xl p-6 max-w-3xl max-h-[90vh] overflow-y-auto">
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="text-xl font-bold text-navy-900">求人プレビュー</h2>
                        <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700">
                            <i data-lucide="x" class="w-6 h-6"></i>
                        </button>
                    </div>
                    ${previewContent}
                    <div class="mt-6 text-center">
                        <button onclick="this.closest('.fixed').remove()" class="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-6 py-2 rounded-lg hover:from-blue-700 hover:to-blue-600 transition-all shadow-lg hover:shadow-xl font-medium">
                            閉じる
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Lucideアイコンを再初期化
            if (window.lucide) {
                window.lucide.createIcons();
            }
        },

        async handleJobSubmit(e) {
            const form = e.target;
            const formData = new FormData(form);
            const successMessage = document.getElementById('success-message');
            const errorMessage = document.getElementById('error-message');
            
            // メッセージを非表示にする
            if (successMessage) successMessage.classList.add('hidden');
            if (errorMessage) errorMessage.classList.add('hidden');

            // フォームデータを取得
            const jobData = {
                company: formData.get('company'),
                email: formData.get('email'),
                position: formData.get('position'),
                region: formData.get('region'),
                location: formData.get('location'),
                salary: formData.get('salary') || '',
                workType: formData.get('workType') || '',
                detail: formData.get('detail') || '',
                requirement: formData.get('requirement') || ''
            };
            
            // デバッグログ
            console.log('Submitting job data:', jobData);
            
            try {
                const result = await ShipHubJobs.postJob(jobData);
                
                if (result.success) {
                    // 成功メッセージを表示
                    if (successMessage) {
                        successMessage.classList.remove('hidden');
                        successMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                    
                    // フォームをリセット
                    form.reset();
                    
                    // 求人管理リストを更新
                    const currentUser = ShipHubAuth.getCurrentUser();
                    if (currentUser && currentUser.companyName) {
                        this.loadCompanyJobs(currentUser.companyName);
                    }
                } else {
                    throw new Error('Unexpected response format');
                }
            } catch (error) {
                console.error('Job posting error:', error);
                
                if (errorMessage) {
                    errorMessage.classList.remove('hidden');
                    
                    // エラーメッセージを更新
                    const errorSpan = errorMessage.querySelector('span');
                    if (errorSpan) {
                        errorSpan.textContent = ShipHubJobs.getJobPostErrorMessage(error.message || 'Unknown error');
                    }
                    
                    // エラーメッセージまでスクロール
                    errorMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        },

        // 企業データ管理初期化
        initCompanyDataManagement() {
            // 現在ログイン中の企業情報を取得
            const currentUser = ShipHubAuth.getCurrentUser();
            if (currentUser && currentUser.userType === '企業') {
                const companyName = currentUser.companyName;
                if (companyName) {
                    // 求人管理データを読み込み
                    this.loadCompanyJobs(companyName);
                    // 応募者管理データを読み込み
                    this.loadCompanyApplications(companyName);
                }
            }
        },

        // 企業の求人データを読み込み
        async loadCompanyJobs(companyName) {
            const jobsLoading = document.getElementById('jobs-loading');
            const jobsList = document.getElementById('jobs-list');
            const jobsEmpty = document.getElementById('jobs-empty');
            const jobsError = document.getElementById('jobs-error');

            if (!jobsList) return; // 求人管理ページが存在しない場合は何もしない

            try {
                // ローディング表示
                if (jobsLoading) jobsLoading.classList.remove('hidden');
                if (jobsList) jobsList.classList.add('hidden');
                if (jobsEmpty) jobsEmpty.classList.add('hidden');
                if (jobsError) jobsError.classList.add('hidden');

                const jobs = await ShipHubData.getCompanyJobs(companyName);

                // ローディング非表示
                if (jobsLoading) jobsLoading.classList.add('hidden');

                if (jobs.length === 0) {
                    // 空の状態表示
                    if (jobsEmpty) jobsEmpty.classList.remove('hidden');
                } else {
                    // 求人リスト表示
                    if (jobsList) {
                        jobsList.innerHTML = jobs.map(job => this.createCompanyJobCard(job)).join('');
                        jobsList.classList.remove('hidden');
                    }
                }
            } catch (error) {
                console.error('Error loading company jobs:', error);
                // ローディング非表示、エラー表示
                if (jobsLoading) jobsLoading.classList.add('hidden');
                if (jobsError) jobsError.classList.remove('hidden');
            }
        },

        // 企業の応募者データを読み込み
        async loadCompanyApplications(companyName) {
            const applicantsLoading = document.getElementById('applicants-loading');
            const applicantsList = document.getElementById('applicants-list');
            const applicantsEmpty = document.getElementById('applicants-empty');
            const applicantsError = document.getElementById('applicants-error');

            if (!applicantsList) return; // 応募者管理ページが存在しない場合は何もしない

            try {
                // ローディング表示
                if (applicantsLoading) applicantsLoading.classList.remove('hidden');
                if (applicantsList) applicantsList.classList.add('hidden');
                if (applicantsEmpty) applicantsEmpty.classList.add('hidden');
                if (applicantsError) applicantsError.classList.add('hidden');

                const applications = await ShipHubData.getCompanyApplications(companyName);

                // ローディング非表示
                if (applicantsLoading) applicantsLoading.classList.add('hidden');

                if (applications.length === 0) {
                    // 空の状態表示
                    if (applicantsEmpty) applicantsEmpty.classList.remove('hidden');
                } else {
                    // 応募者リスト表示
                    if (applicantsList) {
                        applicantsList.innerHTML = applications.map(app => this.createCompanyApplicationCard(app)).join('');
                        applicantsList.classList.remove('hidden');
                    }
                }
            } catch (error) {
                console.error('Error loading company applications:', error);
                // ローディング非表示、エラー表示
                if (applicantsLoading) applicantsLoading.classList.add('hidden');
                if (applicantsError) applicantsError.classList.remove('hidden');
            }
        },

        // 企業求人カード生成
        createCompanyJobCard(job) {
            const salaryText = job.salary ? `${job.salary}万円` : '要相談';
            return `
                <div class="bg-white rounded-xl shadow-sm p-4 md:p-6 border border-gray-100">
                    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div class="flex-1">
                            <h4 class="text-lg font-bold text-navy-900 mb-2">${job.position}</h4>
                            <div class="space-y-2">
                                <div class="flex items-center text-sm text-navy-600">
                                    <i data-lucide="map-pin" class="w-4 h-4 mr-2"></i>
                                    <span>${job.region} - ${job.location}</span>
                                </div>
                                <div class="flex items-center text-sm text-navy-600">
                                    <i data-lucide="banknote" class="w-4 h-4 mr-2"></i>
                                    <span>年収: ${salaryText}</span>
                                </div>
                                <div class="flex items-center text-sm text-navy-600">
                                    <i data-lucide="briefcase" class="w-4 h-4 mr-2"></i>
                                    <span>${job.workType}</span>
                                </div>
                                <div class="flex items-center text-sm text-navy-600">
                                    <i data-lucide="calendar" class="w-4 h-4 mr-2"></i>
                                    <span>投稿日: ${job.createdDate}</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                            <span class="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                                ${job.status}
                            </span>
                            <div class="text-sm text-navy-600">
                                <div>閲覧数: ${job.viewCount}</div>
                                <div>応募数: ${job.applicantCount}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        },

        // 企業応募者カード生成
        createCompanyApplicationCard(application) {
            return `
                <div class="bg-white rounded-xl shadow-sm p-4 md:p-6 border border-gray-100">
                    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div class="flex-1">
                            <div class="flex items-start justify-between mb-3">
                                <div>
                                    <h4 class="text-lg font-bold text-navy-900">${application.name}</h4>
                                    <p class="text-navy-600">${application.email}</p>
                                </div>
                                <span class="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                                    ${application.status}
                                </span>
                            </div>
                            
                            <div class="space-y-2 mb-3">
                                <div class="flex items-center text-sm text-navy-600">
                                    <i data-lucide="briefcase" class="w-4 h-4 mr-2"></i>
                                    <span>応募職種: ${application.position}</span>
                                </div>
                                <div class="flex items-center text-sm text-navy-600">
                                    <i data-lucide="calendar" class="w-4 h-4 mr-2"></i>
                                    <span>応募日: ${application.applicationDate}</span>
                                </div>
                            </div>
                            
                            ${application.message ? `
                                <div class="bg-gray-50 rounded-lg p-3">
                                    <p class="text-sm text-navy-700 font-medium mb-1">自己紹介:</p>
                                    <p class="text-sm text-navy-600">${application.message}</p>
                                </div>
                            ` : ''}
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-2">
                            <button class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm">
                                承認
                            </button>
                            <button class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm">
                                保留
                            </button>
                            <button class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm">
                                却下
                            </button>
                        </div>
                    </div>
                </div>
            `;
        },

        // 認証フォーム初期化
        initAuthForms() {
            // ログインフォーム（旧形式: loginForm）
            const loginForm = document.getElementById('loginForm');
            if (loginForm) {
                loginForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    await this.handleLogin(e);
                });
            }

            // ログインフォーム（新形式: login-form）
            const newLoginForm = document.getElementById('login-form');
            if (newLoginForm) {
                newLoginForm.addEventListener('submit', async (e) => {
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
            
            // ユーザータイプの判定：ファイル名ベースまたはdata属性から
            let expectedUserType;
            const currentPage = window.location.pathname.split('/').pop() || window.location.href.split('/').pop();
            
            if (currentPage.includes('jobseeker-login.html')) {
                expectedUserType = '求職者';
            } else if (currentPage.includes('company-login.html')) {
                expectedUserType = '企業';
            } else {
                // 旧フォーマットの場合はdata属性から判定
                const userType = form.dataset.userType; // 'user' or 'company'
                expectedUserType = userType === 'company' ? '企業' : '求職者';
            }
            
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
                // エラー表示：messageContainerがない場合はalertで表示
                const errorMessage = ShipHubAuth.getErrorMessage(error.message || error);
                if (messageContainer) {
                    messageContainer.innerHTML = `<div class="error-message">${errorMessage}</div>`;
                } else {
                    alert(errorMessage);
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