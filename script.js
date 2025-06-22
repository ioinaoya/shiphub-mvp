// Airtable API設定
const AIRTABLE_API_TOKEN = 'patV6se7KmGamuWT7.451356d3945a45135d354b363a2abd6d9c4d1ce9f74b0cdabee77f8dd055ddbb';
const AIRTABLE_BASE_ID = 'appD06KJ0je7fo62a';
const AIRTABLE_TABLE_NAME = '応募履歴';

// Airtableに応募履歴を記録する関数
async function recordApplication(companyName, position) {
    try {
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
                            '応募日時': new Date().toISOString()
                        }
                    }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Airtableに記録されました:', data);
        return true;
    } catch (error) {
        console.error('Airtable API エラー:', error);
        
        // CORSエラーの場合の特別な処理
        if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
            throw new Error('CORS_ERROR');
        }
        
        return false;
    }
}

// 応募ボタンのクリックイベント
document.getElementById('apply-btn').addEventListener('click', async function() {
    const successMessage = document.getElementById('success-message');
    const errorMessage = document.getElementById('error-message');
    const warningMessage = document.getElementById('warning-message');
    const applyBtn = document.getElementById('apply-btn');
    
    // 会社名と職種を取得
    const companyName = document.querySelector('.company').textContent;
    const position = document.querySelector('.position').textContent;
    
    // ボタンを無効化
    applyBtn.disabled = true;
    applyBtn.textContent = '応募中...';
    applyBtn.style.opacity = '0.7';
    
    // メッセージを非表示
    errorMessage.style.display = 'none';
    warningMessage.style.display = 'none';
    
    try {
        // Airtableに応募履歴を記録
        const success = await recordApplication(companyName, position);
        
        if (success) {
            // 成功時の処理
            successMessage.style.display = 'block';
            applyBtn.textContent = '応募完了';
            applyBtn.style.background = '#48bb78';
        } else {
            // 失敗時の処理
            errorMessage.style.display = 'block';
            applyBtn.textContent = '応募する';
            applyBtn.disabled = false;
            applyBtn.style.opacity = '1';
        }
    } catch (error) {
        console.error('応募処理エラー:', error);
        
        if (error.message === 'CORS_ERROR') {
            // CORSエラーの場合
            warningMessage.style.display = 'block';
            applyBtn.textContent = '応募する';
            applyBtn.disabled = false;
            applyBtn.style.opacity = '1';
        } else {
            // その他のエラーの場合
            errorMessage.style.display = 'block';
            applyBtn.textContent = '応募する';
            applyBtn.disabled = false;
            applyBtn.style.opacity = '1';
        }
    }
}); 