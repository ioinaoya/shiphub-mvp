// ShipHub Authentication System - Refactored Version
(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        API: {
            TOKEN: 'patV6se7KmGamuWT7.451356d3945a45135d354b363a2abd6d9c4d1ce9f74b0cdabee77f8dd055ddbb',
            BASE_ID: 'appD06KJ0je7fo62a',
            USER_TABLE: 'ユーザー管理'
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
        }
    };

    // Auth Module
    const ShipHubAuth = {
        // Session Management
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
                    
                    // Check expiry
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

        // Security utilities
        security: {
            hashPassword(password) {
                if (!password) return '';
                return btoa(password + CONFIG.SECURITY.SALT);
            },

            sanitizeInput(input) {
                if (!input) return '';
                return input.toString().trim().replace(/[<>\"'&]/g, '');
            },

            checkLoginAttempts(email) {
                const attemptKey = `login_attempts_${this.sanitizeInput(email)}`;
                const lastAttemptKey = `last_attempt_${this.sanitizeInput(email)}`;
                
                const attempts = parseInt(localStorage.getItem(attemptKey) || '0');
                const lastAttempt = localStorage.getItem(lastAttemptKey);
                
                // Reset if lockout period expired
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

        // Debug functions
        debug: {
            async getTableStructure() {
                try {
                    const response = await fetch(`https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.USER_TABLE)}?maxRecords=1`, {
                        headers: {
                            'Authorization': `Bearer ${CONFIG.API.TOKEN}`
                        }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        const fields = data.records[0]?.fields || {};
                        console.log('🔍 実際のAirtableフィールド名:', Object.keys(fields));
                        console.log('🔍 フィールド値の例:', fields);
                        return Object.keys(fields);
                    } else {
                        console.error('🚨 テーブル構造取得エラー:', response.status);
                        return null;
                    }
                } catch (error) {
                    console.error('🚨 テーブル構造取得例外:', error);
                    return null;
                }
            },

            logRequestData(userData, functionName) {
                console.log(`🔍 ${functionName} 送信データ:`, {
                    keys: Object.keys(userData),
                    values: userData,
                    jsonString: JSON.stringify(userData, null, 2)
                });
            }
        },

        // API interactions
        api: {
            async findUser(email) {
                const sanitizedEmail = ShipHubAuth.security.sanitizeInput(email);
                const filterFormula = `{メールアドレス} = '${sanitizedEmail}'`;
                const url = `https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.USER_TABLE)}?filterByFormula=${encodeURIComponent(filterFormula)}`;
                
                try {
                    const response = await fetch(url, {
                        headers: {
                            'Authorization': `Bearer ${CONFIG.API.TOKEN}`
                        }
                    });
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    
                    const data = await response.json();
                    return data.records[0] || null;
                } catch (error) {
                    console.error('User lookup error:', error);
                    throw new Error('NETWORK_ERROR');
                }
            },

            async updateLastLogin(userId) {
                if (!userId) return;
                
                try {
                    await fetch(`https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.USER_TABLE)}/${userId}`, {
                        method: 'PATCH',
                        headers: {
                            'Authorization': `Bearer ${CONFIG.API.TOKEN}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            fields: {
                                '最終ログイン': new Date().toISOString().split('T')[0]
                            }
                        })
                    });
                } catch (error) {
                    console.error('Failed to update last login:', error);
                    // Continue silently
                }
            },

            async createUser(userData) {
                try {
                    // デバッグログ追加
                    ShipHubAuth.debug.logRequestData(userData, 'createUser');
                    
                    const requestBody = {
                        records: [{
                            fields: userData
                        }]
                    };
                    
                    console.log('🔍 createUser リクエストボディ:', JSON.stringify(requestBody, null, 2));
                    
                    const response = await fetch(`https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.USER_TABLE)}`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${CONFIG.API.TOKEN}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(requestBody)
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        console.error('🚨 Airtable 422エラー詳細:', {
                            status: response.status,
                            statusText: response.statusText,
                            errorData: errorData,
                            sentData: userData,
                            url: `https://api.airtable.com/v0/${CONFIG.API.BASE_ID}/${encodeURIComponent(CONFIG.API.USER_TABLE)}`
                        });
                        
                        // より具体的なエラーメッセージを生成
                        if (errorData.error && errorData.error.message) {
                            throw new Error(`AIRTABLE_ERROR: ${errorData.error.message}`);
                        }
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const data = await response.json();
                    console.log('✅ ユーザー作成成功:', data.records[0]);
                    return data.records[0];
                } catch (error) {
                    console.error('🚨 User creation error:', error);
                    throw error; // 詳細なエラーをそのまま伝播
                }
            }
        },

        // Main authentication function
        async authenticate(email, password, expectedUserType = null) {
            try {
                // Validate inputs
                if (!email || !password) {
                    throw new Error('INVALID_INPUT');
                }

                // Check login attempts
                if (!this.security.checkLoginAttempts(email)) {
                    throw new Error('LOGIN_ATTEMPTS_EXCEEDED');
                }
                
                // Find user
                const user = await this.api.findUser(email);
                if (!user) {
                    this.security.incrementLoginAttempts(email);
                    throw new Error('USER_NOT_FOUND');
                }
                
                // Check account status
                if (user.fields['アカウント状態'] === '無効') {
                    throw new Error('ACCOUNT_DISABLED');
                }
                
                // Verify password
                const hashedPassword = this.security.hashPassword(password);
                const storedPassword = user.fields['パスワード'];
                
                if (hashedPassword !== storedPassword && password !== storedPassword) {
                    this.security.incrementLoginAttempts(email);
                    throw new Error('WRONG_PASSWORD');
                }
                
                // Check user type if specified
                if (expectedUserType && user.fields['ユーザータイプ'] !== expectedUserType) {
                    throw new Error('WRONG_USER_TYPE');
                }
                
                // Success
                this.security.resetLoginAttempts(email);
                this.session.save(user);
                
                // Update last login asynchronously
                this.api.updateLastLogin(user.id).catch(() => {});
                
                return {
                    success: true,
                    user: {
                        id: user.id,
                        email: user.fields['メールアドレス'],
                        userType: user.fields['ユーザータイプ'],
                        companyName: user.fields['会社名'] || null
                    }
                };
                
            } catch (error) {
                return {
                    success: false,
                    error: error.message
                };
            }
        },

        // Registration functions
        async registerCompany(formData) {
            try {
                console.log('🔍 registerCompany 開始 - フォームデータ:', formData);
                
                // デバッグ: テーブル構造を確認
                console.log('🔍 テーブル構造を確認中...');
                await this.debug.getTableStructure();
                
                // Check if email already exists
                const existingUser = await this.api.findUser(formData.email);
                if (existingUser) {
                    throw new Error('EMAIL_EXISTS');
                }

                // 最小限データでのテスト用フラグ
                const useMinimalData = false; // デバッグ時にtrueに変更

                let userData;
                
                if (useMinimalData) {
                    // 最小限データでのテスト
                    userData = {
                        'メールアドレス': this.security.sanitizeInput(formData.email),
                        'パスワード': this.security.hashPassword(formData.password),
                        'ユーザータイプ': '企業'
                    };
                    console.log('🔍 最小限データでテスト:', userData);
                } else {
                    // 最小限の必要データのみ
                    userData = {
                        'メールアドレス': this.security.sanitizeInput(formData.email),
                        'パスワード': this.security.hashPassword(formData.password),
                        'ユーザータイプ': '企業',
                        '会社名': this.security.sanitizeInput(formData.companyName)
                    };
                    
                    // 電話番号がある場合のみ追加（Airtableで実際のフィールド名を確認後）
                    if (formData.phone && formData.phone.trim()) {
                        // userData['電話番号'] = this.security.sanitizeInput(formData.phone);
                    }
                }

                console.log('🔍 送信予定データ:', userData);

                // Create user in Airtable
                const newUser = await this.api.createUser(userData);

                // Auto-login after registration
                await this.authenticate(formData.email, formData.password, '企業');
                
                return {
                    success: true,
                    user: newUser
                };
            } catch (error) {
                console.error('🚨 registerCompany エラー:', error);
                return {
                    success: false,
                    error: error.message
                };
            }
        },

        async registerUser(formData) {
            try {
                console.log('🔍 registerUser 開始 - フォームデータ:', formData);
                
                // デバッグ: テーブル構造を確認
                console.log('🔍 テーブル構造を確認中...');
                await this.debug.getTableStructure();
                
                // Check if email already exists
                const existingUser = await this.api.findUser(formData.email);
                if (existingUser) {
                    throw new Error('EMAIL_EXISTS');
                }

                // 最小限データでのテスト用フラグ
                const useMinimalData = false; // デバッグ時にtrueに変更

                let userData;
                
                if (useMinimalData) {
                    // 最小限データでのテスト
                    userData = {
                        'メールアドレス': this.security.sanitizeInput(formData.email),
                        'パスワード': this.security.hashPassword(formData.password),
                        'ユーザータイプ': '求職者'
                    };
                    console.log('🔍 最小限データでテスト:', userData);
                } else {
                    // 最小限の必要データのみ
                    userData = {
                        'メールアドレス': this.security.sanitizeInput(formData.email),
                        'パスワード': this.security.hashPassword(formData.password),
                        'ユーザータイプ': '求職者',
                        '氏名': this.security.sanitizeInput(`${formData.lastName} ${formData.firstName}`)
                    };
                    
                    // 電話番号がある場合のみ追加（Airtableで実際のフィールド名を確認後）
                    if (formData.phone && formData.phone.trim()) {
                        // userData['電話番号'] = this.security.sanitizeInput(formData.phone);
                    }
                }

                console.log('🔍 送信予定データ:', userData);

                // Create user in Airtable
                const newUser = await this.api.createUser(userData);

                // Auto-login after registration
                await this.authenticate(formData.email, formData.password, '求職者');
                
                return {
                    success: true,
                    user: newUser
                };
            } catch (error) {
                console.error('🚨 registerUser エラー:', error);
                return {
                    success: false,
                    error: error.message
                };
            }
        },

        // Page protection
        requireAuth(userType = null, redirectPage = null) {
            if (!this.session.isValid(userType)) {
                if (redirectPage) {
                    // Save current URL for redirect after login
                    sessionStorage.setItem('shiphub_redirect_after_login', window.location.href);
                    window.location.href = redirectPage;
                }
                return false;
            }
            return true;
        },

        // Redirect after login
        redirectAfterLogin(userType) {
            // Check for saved redirect URL
            const savedRedirect = sessionStorage.getItem('shiphub_redirect_after_login');
            if (savedRedirect) {
                sessionStorage.removeItem('shiphub_redirect_after_login');
                window.location.href = savedRedirect;
                return;
            }

            // Default redirects
            const redirectMap = {
                '企業': CONFIG.ROUTES.COMPANY_HOME,
                '求職者': CONFIG.ROUTES.USER_HOME
            };
            
            const destination = redirectMap[userType];
            if (destination) {
                window.location.href = destination;
            }
        },

        // Error handling
        getErrorMessage(errorCode) {
            const messages = {
                'USER_NOT_FOUND': 'メールアドレスが登録されていません',
                'WRONG_PASSWORD': 'パスワードが間違っています',
                'WRONG_USER_TYPE': 'このページにはアクセスできません',
                'ACCOUNT_DISABLED': 'アカウントが無効化されています',
                'NETWORK_ERROR': '接続エラーが発生しました。しばらくしてからお試しください',
                'LOGIN_ATTEMPTS_EXCEEDED': 'ログイン試行回数が上限に達しました。1時間後に再度お試しください',
                'INVALID_INPUT': 'メールアドレスとパスワードを入力してください',
                'EMAIL_EXISTS': 'このメールアドレスは既に登録されています',
                'CREATION_ERROR': 'アカウントの作成に失敗しました。もう一度お試しください'
            };
            
            // Airtableエラーのより詳細な処理
            if (errorCode.startsWith('AIRTABLE_ERROR:')) {
                const airtableMessage = errorCode.replace('AIRTABLE_ERROR: ', '');
                return `Airtableエラー: ${airtableMessage}`;
            }
            
            if (errorCode.startsWith('HTTP ')) {
                return `サーバーエラー: ${errorCode}。管理者にお問い合わせください。`;
            }
            
            return messages[errorCode] || `エラーが発生しました: ${errorCode}`;
        },

        // Logout
        logout(redirectTo = CONFIG.ROUTES.USER_HOME) {
            this.session.clear();
            window.location.href = redirectTo;
        },

        // Get current user info
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

    // Export to global scope for backward compatibility
    window.ShipHubAuth = ShipHubAuth;

    // Legacy function exports for existing code compatibility
    window.authenticateUser = function(email, password, expectedUserType) {
        return ShipHubAuth.authenticate(email, password, expectedUserType);
    };

    window.requireAuth = function(userType, redirectPage) {
        return ShipHubAuth.requireAuth(userType, redirectPage);
    };

    window.checkAuth = function(requiredUserType) {
        return ShipHubAuth.session.isValid(requiredUserType);
    };

    window.getSession = function() {
        return ShipHubAuth.session.get();
    };

    window.saveSession = function(userData) {
        return ShipHubAuth.session.save(userData);
    };

    window.clearSession = function() {
        return ShipHubAuth.session.clear();
    };

    window.redirectAfterLogin = function(userType) {
        return ShipHubAuth.redirectAfterLogin(userType);
    };

    window.handleAuthError = function(errorType) {
        return ShipHubAuth.getErrorMessage(errorType);
    };

    window.logout = function() {
        return ShipHubAuth.logout();
    };

    // Registration function exports
    window.registerCompany = async function(formData) {
        const result = await ShipHubAuth.registerCompany(formData);
        if (result.success) {
            ShipHubAuth.redirectAfterLogin('企業');
        } else {
            throw new Error(ShipHubAuth.getErrorMessage(result.error));
        }
        return result;
    };

    window.registerUser = async function(formData) {
        const result = await ShipHubAuth.registerUser(formData);
        if (result.success) {
            ShipHubAuth.redirectAfterLogin('求職者');
        } else {
            throw new Error(ShipHubAuth.getErrorMessage(result.error));
        }
        return result;
    };

    // Development helpers
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        window.ShipHubAuth.testUsers = {
            company: {
                email: 'company@test.com',
                password: 'test123',
                userType: '企業',
                companyName: 'テスト海運'
            },
            user: {
                email: 'user@test.com',
                password: 'test456',
                userType: '求職者'
            }
        };

        // デバッグ用グローバル関数
        window.debugAirtable = async function() {
            console.log('🔍 Airtableデバッグ開始...');
            const fields = await ShipHubAuth.debug.getTableStructure();
            console.log('🔍 利用可能フィールド:', fields);
            return fields;
        };

        window.testMinimalUser = async function(email = 'test@example.com') {
            console.log('🔍 最小限データでユーザー作成テスト...');
            const userData = {
                'メールアドレス': email,
                'パスワード': 'test123',
                'ユーザータイプ': '求職者'
            };
            try {
                const result = await ShipHubAuth.api.createUser(userData);
                console.log('✅ テスト成功:', result);
                return result;
            } catch (error) {
                console.error('🚨 テスト失敗:', error);
                return error;
            }
        };

        window.testFieldByField = async function(email = 'fieldtest@example.com') {
            console.log('🔍 フィールド別テスト開始...');
            
            const fields = [
                {'メールアドレス': email},
                {'パスワード': 'test123'},
                {'ユーザータイプ': '求職者'},
                {'氏名': 'テスト 太郎'},
                {'船舶関連経験': '1-3年'},
                {'希望職種': '航海士'},
                {'保有資格': '海技士（航海）'},
                {'その他資格': 'テスト資格'},
                {'登録日': new Date().toISOString().split('T')[0]},
                {'アカウント状態': '有効'}
            ];

            let userData = {};
            
            for (let i = 0; i < fields.length; i++) {
                userData = {...userData, ...fields[i]};
                const fieldName = Object.keys(fields[i])[0];
                
                console.log(`🔍 フィールド ${i+1}/${fields.length} テスト: "${fieldName}"`);
                console.log('現在のデータ:', userData);
                
                try {
                    const result = await ShipHubAuth.api.createUser(userData);
                    console.log(`✅ フィールド "${fieldName}" まで成功`);
                    
                    // テストユーザーを削除（クリーンアップ）
                    console.log('🗑️ テストユーザーをクリーンアップ...');
                    break; // 成功したら終了
                } catch (error) {
                    console.error(`🚨 フィールド "${fieldName}" でエラー:`, error.message);
                    if (error.message.includes('Unknown field name')) {
                        console.error(`❌ 無効なフィールド名: "${fieldName}"`);
                    }
                }
            }
        };
    }

})();