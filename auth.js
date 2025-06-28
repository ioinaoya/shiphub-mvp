// ShipHub認証・セッション管理システム
(function() {
    'use strict';
    
    // 設定
    const CONFIG = {
        AIRTABLE: {
            BASE_ID: 'appD06KJ0je7fo62a',
            API_KEY: 'patV6se7KmGamuWT7.451356d3945a45135d354b363a2abd6d9c4d1ce9f74b0cdabee77f8dd055ddbb',
            TABLE_NAME: 'ユーザー管理'
        },
        SESSION: {
            DURATION: 24 * 60 * 60 * 1000, // 24時間（ミリ秒）
            STORAGE_KEY: 'shiphub_session'
        }
    };
    
    // ユーザー認証・セッション管理クラス
    class ShipHubAuth {
        constructor() {
            this.session = new SessionManager();
            this.api = new AirtableAPI();
        }
        
        // ログイン処理
        async login(email, password, userType) {
            try {
                console.log(`Attempting login for ${email} as ${userType}`);
                
                // Airtableからユーザー情報を取得
                const userData = await this.api.getUserByEmail(email);
                
                if (!userData) {
                    throw new Error('ユーザーが見つかりません');
                }
                
                // パスワード検証（実際の実装ではハッシュ化されたパスワードと比較）
                if (userData.パスワード !== password) {
                    throw new Error('パスワードが正しくありません');
                }
                
                // ユーザータイプ検証
                if (userData.ユーザータイプ !== userType) {
                    throw new Error('ユーザータイプが一致しません');
                }
                
                // アカウントステータス確認
                if (userData.ステータス !== 'アクティブ') {
                    throw new Error('アカウントが無効です');
                }
                
                // セッション作成
                const sessionData = {
                    userId: userData.recordId,
                    email: userData.メールアドレス,
                    userType: userData.ユーザータイプ,
                    name: userData.氏名 || userData.担当者名 || '',
                    companyName: userData.会社名 || '',
                    jobTitle: userData.職種 || userData.役職 || '',
                    loginTime: new Date().toISOString()
                };
                
                this.session.create(sessionData);
                
                console.log('Login successful:', sessionData);
                return {
                    success: true,
                    data: sessionData
                };
                
            } catch (error) {
                console.error('Login error:', error);
                return {
                    success: false,
                    error: error.message
                };
            }
        }
        
        // ログアウト処理
        logout() {
            this.session.destroy();
            console.log('User logged out');
        }
        
        // 現在のユーザー情報を取得
        getCurrentUser() {
            return this.session.getData();
        }
        
        // 認証チェック
        isAuthenticated(requiredUserType = null) {
            const sessionData = this.session.getData();
            
            if (!sessionData) {
                return false;
            }
            
            if (requiredUserType && sessionData.userType !== requiredUserType) {
                return false;
            }
            
            return this.session.isValid();
        }
        
        // ユーザー情報更新
        updateUserInfo(updates) {
            const currentData = this.session.getData();
            if (currentData) {
                const updatedData = { ...currentData, ...updates };
                this.session.update(updatedData);
                return true;
            }
            return false;
        }
    }
    
    // セッション管理クラス
    class SessionManager {
        constructor() {
            this.storageKey = CONFIG.SESSION.STORAGE_KEY;
        }
        
        // セッション作成
        create(userData) {
            const sessionData = {
                ...userData,
                expires: Date.now() + CONFIG.SESSION.DURATION,
                created: Date.now()
            };
            
            try {
                localStorage.setItem(this.storageKey, JSON.stringify(sessionData));
                return true;
            } catch (error) {
                console.error('Failed to create session:', error);
                return false;
            }
        }
        
        // セッションデータ取得
        getData() {
            try {
                const data = localStorage.getItem(this.storageKey);
                if (!data) return null;
                
                const sessionData = JSON.parse(data);
                
                // 有効期限チェック
                if (Date.now() > sessionData.expires) {
                    this.destroy();
                    return null;
                }
                
                return sessionData;
            } catch (error) {
                console.error('Failed to get session data:', error);
                this.destroy();
                return null;
            }
        }
        
        // セッション更新
        update(userData) {
            const currentData = this.getData();
            if (!currentData) return false;
            
            const updatedData = {
                ...currentData,
                ...userData,
                expires: Date.now() + CONFIG.SESSION.DURATION
            };
            
            try {
                localStorage.setItem(this.storageKey, JSON.stringify(updatedData));
                return true;
            } catch (error) {
                console.error('Failed to update session:', error);
                return false;
            }
        }
        
        // セッション有効性チェック
        isValid(requiredUserType = null) {
            const data = this.getData();
            
            if (!data) return false;
            
            if (requiredUserType && data.userType !== requiredUserType) {
                return false;
            }
            
            return Date.now() < data.expires;
        }
        
        // セッション破棄
        destroy() {
            try {
                localStorage.removeItem(this.storageKey);
                return true;
            } catch (error) {
                console.error('Failed to destroy session:', error);
                return false;
            }
        }
        
        // セッション延長
        extend() {
            const data = this.getData();
            if (data) {
                data.expires = Date.now() + CONFIG.SESSION.DURATION;
                try {
                    localStorage.setItem(this.storageKey, JSON.stringify(data));
                    return true;
                } catch (error) {
                    console.error('Failed to extend session:', error);
                    return false;
                }
            }
            return false;
        }
    }
    
    // Airtable API クラス
    class AirtableAPI {
        constructor() {
            this.baseUrl = `https://api.airtable.com/v0/${CONFIG.AIRTABLE.BASE_ID}`;
            this.headers = {
                'Authorization': `Bearer ${CONFIG.AIRTABLE.API_KEY}`,
                'Content-Type': 'application/json'
            };
        }
        
        // メールアドレスでユーザー検索
        async getUserByEmail(email) {
            try {
                const filterFormula = `{メールアドレス} = '${email}'`;
                const url = `${this.baseUrl}/${encodeURIComponent(CONFIG.AIRTABLE.TABLE_NAME)}?filterByFormula=${encodeURIComponent(filterFormula)}`;
                
                const response = await fetch(url, {
                    method: 'GET',
                    headers: this.headers
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const data = await response.json();
                
                if (data.records && data.records.length > 0) {
                    const record = data.records[0];
                    return {
                        recordId: record.id,
                        ...record.fields
                    };
                }
                
                return null;
            } catch (error) {
                console.error('Error fetching user from Airtable:', error);
                throw error;
            }
        }
        
        // ユーザー情報更新
        async updateUser(recordId, updateData) {
            try {
                const url = `${this.baseUrl}/${encodeURIComponent(CONFIG.AIRTABLE.TABLE_NAME)}/${recordId}`;
                
                const response = await fetch(url, {
                    method: 'PATCH',
                    headers: this.headers,
                    body: JSON.stringify({
                        fields: updateData
                    })
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                return await response.json();
            } catch (error) {
                console.error('Error updating user in Airtable:', error);
                throw error;
            }
        }
        
        // 新規ユーザー作成
        async createUser(userData) {
            try {
                const url = `${this.baseUrl}/${encodeURIComponent(CONFIG.AIRTABLE.TABLE_NAME)}`;
                
                const response = await fetch(url, {
                    method: 'POST',
                    headers: this.headers,
                    body: JSON.stringify({
                        records: [{
                            fields: {
                                ...userData,
                                ステータス: 'アクティブ',
                                登録日: new Date().toISOString().split('T')[0]
                            }
                        }]
                    })
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                return await response.json();
            } catch (error) {
                console.error('Error creating user in Airtable:', error);
                throw error;
            }
        }
    }
    
    // ユーティリティ関数
    const Utils = {
        // パスワードハッシュ化（簡易版 - 実際の実装では強力なハッシュ関数を使用）
        hashPassword(password) {
            // 実際の実装ではbcryptやscryptなどを使用
            return btoa(password + 'shiphub_salt').replace(/[^a-zA-Z0-9]/g, '');
        },
        
        // メールアドレス検証
        validateEmail(email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(email);
        },
        
        // パスワード強度チェック
        validatePassword(password) {
            if (password.length < 8) {
                return { valid: false, message: 'パスワードは8文字以上にしてください' };
            }
            if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
                return { valid: false, message: 'パスワードは英字と数字を含んでください' };
            }
            return { valid: true, message: '' };
        },
        
        // 自動ログアウトタイマー
        setupAutoLogout(auth, timeoutMinutes = 60) {
            let timer;
            
            const resetTimer = () => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    auth.logout();
                    alert('セッションがタイムアウトしました。再度ログインしてください。');
                    window.location.href = 'LP.html';
                }, timeoutMinutes * 60 * 1000);
            };
            
            // ユーザーアクティビティを監視
            ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(event => {
                document.addEventListener(event, resetTimer, true);
            });
            
            resetTimer();
        }
    };
    
    // UI更新ヘルパー
    const UIUpdater = {
        // ユーザー情報を画面に反映
        updateUserDisplay(userData) {
            if (!userData) return;
            
            // 求職者マイページの更新
            const userNameElement = document.getElementById('user-name');
            const userTitleElement = document.getElementById('user-title');
            
            if (userNameElement && userData.userType === '求職者') {
                userNameElement.textContent = userData.name || '名前未設定';
            }
            
            if (userTitleElement && userData.userType === '求職者') {
                userTitleElement.textContent = userData.jobTitle || '職種未設定';
            }
            
            // 企業マイページの更新
            const companyNameElement = document.getElementById('company-name');
            const companyContactElement = document.getElementById('company-contact');
            
            if (companyNameElement && userData.userType === '企業') {
                companyNameElement.textContent = userData.companyName || '企業名未設定';
            }
            
            if (companyContactElement && userData.userType === '企業') {
                companyContactElement.textContent = userData.name || '担当者未設定';
            }
            
            // ヘッダーのユーザー情報更新（共通）
            this.updateHeaderUserInfo(userData);
        },
        
        // ヘッダーのユーザー情報更新
        updateHeaderUserInfo(userData) {
            // ユーザーアイコンの文字更新
            const userIcons = document.querySelectorAll('.w-8.h-8, .w-10.h-10');
            userIcons.forEach(icon => {
                if (icon.classList.contains('bg-ocean-600')) {
                    const initial = userData.userType === '企業' 
                        ? userData.companyName?.charAt(0) || '企'
                        : userData.name?.charAt(0) || '求';
                    icon.textContent = initial;
                }
            });
            
            // ヘッダーの表示名更新
            const headerNameElements = document.querySelectorAll('.text-sm.font-semibold.text-navy-900, .text-xs.md\\:text-sm.font-semibold.text-navy-900');
            headerNameElements.forEach(element => {
                if (userData.userType === '企業') {
                    element.textContent = userData.companyName || '企業名未設定';
                } else {
                    element.textContent = userData.name || '名前未設定';
                }
            });
            
            // ヘッダーのサブタイトル更新
            const headerSubElements = document.querySelectorAll('.text-xs.text-navy-600');
            headerSubElements.forEach(element => {
                if (userData.userType === '企業') {
                    element.textContent = userData.name || '採用担当者';
                } else {
                    element.textContent = userData.jobTitle || '求職者';
                }
            });
        },
        
        // ローディング状態表示
        showLoading(message = '読み込み中...') {
            const elements = document.querySelectorAll('#user-name, #user-title, #company-name, #company-contact');
            elements.forEach(element => {
                if (element) {
                    element.textContent = message;
                    element.classList.add('animate-pulse');
                }
            });
        },
        
        // エラー状態表示
        showError(message = 'エラーが発生しました') {
            const elements = document.querySelectorAll('#user-name, #user-title, #company-name, #company-contact');
            elements.forEach(element => {
                if (element) {
                    element.textContent = message;
                    element.classList.remove('animate-pulse');
                    element.classList.add('text-red-600');
                }
            });
        }
    };
    
    // ページ固有の認証チェック
    const PageAuth = {
        // 求職者ページ認証チェック
        checkJobseekerAuth(auth) {
            if (!auth.isAuthenticated('求職者')) {
                console.log('Unauthorized access to jobseeker page');
                window.location.href = 'jobseeker-login.html';
                return false;
            }
            return true;
        },
        
        // 企業ページ認証チェック
        checkCompanyAuth(auth) {
            if (!auth.isAuthenticated('企業')) {
                console.log('Unauthorized access to company page');
                window.location.href = 'company-login.html';
                return false;
            }
            return true;
        },
        
        // 汎用認証チェック
        checkAuth(auth, requiredUserType, redirectUrl) {
            if (!auth.isAuthenticated(requiredUserType)) {
                console.log(`Unauthorized access, redirecting to ${redirectUrl}`);
                window.location.href = redirectUrl;
                return false;
            }
            return true;
        }
    };
    
    // グローバルに公開
    window.ShipHubAuth = ShipHubAuth;
    window.ShipHubAuthUtils = Utils;
    window.ShipHubUIUpdater = UIUpdater;
    window.ShipHubPageAuth = PageAuth;
    
    // ページ読み込み時の初期化
    document.addEventListener('DOMContentLoaded', function() {
        // 認証システム初期化
        const auth = new ShipHubAuth();
        window.shipHubAuth = auth;
        
        // 現在のユーザー情報を取得して画面に反映
        const userData = auth.getCurrentUser();
        if (userData) {
            UIUpdater.updateUserDisplay(userData);
            
            // セッション延長
            auth.session.extend();
            
            // 自動ログアウト設定（60分）
            Utils.setupAutoLogout(auth, 60);
            
            console.log('User session restored:', userData);
        } else {
            console.log('No active session found');
        }
    });
    
})();