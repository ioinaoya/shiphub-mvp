// Airtable API設定
const AIRTABLE_API_TOKEN = 'patV6se7KmGamuWT7.451356d3945a45135d354b363a2abd6d9c4d1ce9f74b0cdabee77f8dd055ddbb';
const AIRTABLE_BASE_ID = 'appD06KJ0je7fo62a';
const AIRTABLE_TABLE_NAME = '応募履歴';

// CORSエラーを回避するためのプロキシサーバー
const PROXY_URL = 'https://cors-anywhere.herokuapp.com/';

// フォームバリデーション関数
function validateForm() {
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const message = document.getElementById('message').value.trim();
    
    let isValid = true;
    
    // 名前のバリデーション
    if (!name) {
        document.getElementById('name-error').style.display = 'block';
        isValid = false;
    } else {
        document.getElementById('name-error').style.display = 'none';
    }
    
    // メールアドレスのバリデーション
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        document.getElementById('email-error').style.display = 'block';
        isValid = false;
    } else {
        document.getElementById('email-error').style.display = 'none';
    }
    
    // 自己紹介のバリデーション
    if (!message) {
        document.getElementById('message-error').style.display = 'block';
        isValid = false;
    } else {
        document.getElementById('message-error').style.display = 'none';
    }
    
    return isValid;
}

// Airtableに応募履歴を記録する関数
async function recordApplication(companyName, position, name, email, message) {
    // まず直接APIを試す
    try {
        console.log('直接APIを試行中...');
        const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                records: [
                    {
                        fields: {
                            '会社名': companyName,
                            '職種': position,
                            '名前': name,
                            'メールアドレス': email,
                            '自己紹介': message
                        }
                    }
                ]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('直接API HTTP Error:', response.status, errorText);
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Airtableに記録されました（直接API）:', data);
        return true;
    } catch (error) {
        console.error('直接API エラー:', error);
        
        // CORSエラーの場合、プロキシサーバーを試す
        if (error.message.includes('CORS') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            console.log('CORSエラー検出、プロキシサーバーを試行中...');
            
            try {
                const proxyResponse = await fetch(`${PROXY_URL}https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`,
                        'Content-Type': 'application/json',
                        'Origin': window.location.origin
                    },
                    body: JSON.stringify({
                        records: [
                            {
                                fields: {
                                    '会社名': companyName,
                                    '職種': position,
                                    '名前': name,
                                    'メールアドレス': email,
                                    '自己紹介': message
                                }
                            }
                        ]
                    })
                });

                if (!proxyResponse.ok) {
                    const errorText = await proxyResponse.text();
                    console.error('プロキシ HTTP Error:', proxyResponse.status, errorText);
                    throw new Error(`HTTP error! status: ${proxyResponse.status}`);
                }

                const data = await proxyResponse.json();
                console.log('Airtableに記録されました（プロキシ経由）:', data);
                return true;
            } catch (proxyError) {
                console.error('プロキシサーバー エラー:', proxyError);
                
                // プロキシサーバーのエラーの場合
                if (proxyError.message.includes('429') || proxyError.message.includes('Too Many Requests')) {
                    throw new Error('PROXY_ERROR');
                }
                
                throw new Error('CORS_ERROR');
            }
        }
        
        return false;
    }
}

// フォーム送信イベント
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('application-form');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // フォームバリデーション
            if (!validateForm()) {
                return;
            }
            
            const successMessage = document.getElementById('success-message');
            const errorMessage = document.getElementById('error-message');
            const warningMessage = document.getElementById('warning-message');
            const applyBtn = document.getElementById('apply-btn');
            
            // フォームデータを取得
            const companyName = document.querySelector('.company').textContent;
            const position = document.querySelector('.position').textContent;
            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value.trim();
            const message = document.getElementById('message').value.trim();
            
            // ボタンを無効化
            applyBtn.disabled = true;
            applyBtn.textContent = '応募中...';
            
            // メッセージを非表示
            successMessage.style.display = 'none';
            errorMessage.style.display = 'none';
            warningMessage.style.display = 'none';
            
            try {
                // Airtableに応募履歴を記録
                const success = await recordApplication(companyName, position, name, email, message);
                
                if (success) {
                    // 成功時の処理
                    successMessage.style.display = 'block';
                    applyBtn.textContent = '応募完了';
                    applyBtn.style.background = '#48bb78';
                    
                    // フォームをリセット
                    document.getElementById('application-form').reset();
                } else {
                    // 失敗時の処理
                    errorMessage.style.display = 'block';
                    applyBtn.textContent = '応募する';
                    applyBtn.disabled = false;
                }
            } catch (error) {
                console.error('応募処理エラー:', error);
                
                if (error.message === 'CORS_ERROR') {
                    // CORSエラーの場合
                    warningMessage.innerHTML = 'CORSエラーのため、ローカル環境ではAirtableへの記録ができません。<br>実際のサーバー環境でご利用ください。';
                    warningMessage.style.display = 'block';
                    applyBtn.textContent = '応募する';
                    applyBtn.disabled = false;
                } else if (error.message === 'PROXY_ERROR') {
                    // プロキシエラーの場合
                    warningMessage.innerHTML = 'プロキシサーバーの制限により、一時的に利用できません。<br>しばらく時間をおいてから再試行してください。';
                    warningMessage.style.display = 'block';
                    applyBtn.textContent = '応募する';
                    applyBtn.disabled = false;
                } else {
                    // その他のエラーの場合
                    errorMessage.innerHTML = `エラーが発生しました: ${error.message}<br>もう一度お試しください。`;
                    errorMessage.style.display = 'block';
                    applyBtn.textContent = '応募する';
                    applyBtn.disabled = false;
                }
            }
        });
    }

    // ページ読み込み時のデバッグ情報
    console.log('Airtable設定:', {
        baseId: AIRTABLE_BASE_ID,
        tableName: AIRTABLE_TABLE_NAME,
        proxyUrl: PROXY_URL
    });
});