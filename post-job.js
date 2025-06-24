// 企業認証チェック
document.addEventListener('DOMContentLoaded', function() {
    // 企業認証チェック
    if (!requireAuth('企業', 'company-login.html')) {
        return;
    }
});

// Airtable設定
const AIRTABLE_API_TOKEN = 'patV6se7KmGamuWT7.451356d3945a45135d354b363a2abd6d9c4d1ce9f74b0cdabee77f8dd055ddbb';
const AIRTABLE_BASE_ID = 'appD06KJ0je7fo62a';
const JOBS_TABLE_NAME = '求人';
const PROXY_URL = 'https://cors-anywhere.herokuapp.com/';

// バリデーション
function validateForm() {
    let valid = true;
    // 必須
    const requiredFields = [
        {id: 'company', error: 'company-error'},
        {id: 'position', error: 'position-error'},
        {id: 'region', error: 'region-error'},
        {id: 'location', error: 'location-error'},
        {id: 'salary', error: 'salary-error'},
        {id: 'status', error: 'status-error'}
    ];
    requiredFields.forEach(f => {
        const v = document.getElementById(f.id).value.trim();
        if (!v) {
            document.getElementById(f.error).style.display = 'block';
            valid = false;
        } else {
            document.getElementById(f.error).style.display = 'none';
        }
    });
    // 年収数値
    const salary = document.getElementById('salary').value.trim();
    if (salary && (isNaN(salary) || Number(salary) < 0)) {
        document.getElementById('salary-error').style.display = 'block';
        valid = false;
    }
    return valid;
}

// 入力リアルタイムバリデーション
// ... existing code ...
document.querySelectorAll('.form-input, .form-select, .form-textarea').forEach(el => {
    el.addEventListener('input', () => validateForm());
});

// プレビュー
// ... existing code ...
document.getElementById('preview-btn').addEventListener('click', function() {
    if (!validateForm()) return;
    const preview = document.getElementById('preview-card');
    const get = id => document.getElementById(id).value.trim();
    preview.innerHTML = `
        <div class="preview-title">プレビュー</div>
        <div class="preview-row"><b>企業名:</b> ${get('company')}</div>
        <div class="preview-row"><b>職種:</b> ${get('position')}</div>
        <div class="preview-row"><b>地域:</b> ${get('region')}</div>
        <div class="preview-row"><b>勤務地:</b> ${get('location')}</div>
        <div class="preview-row"><b>年収:</b> ${get('salary')}万円</div>
        <div class="preview-row"><b>応募ステータス:</b> ${get('status')}</div>
        ${get('startDate') ? `<div class="preview-row"><b>募集開始日:</b> ${get('startDate')}</div>` : ''}
        ${get('workType') ? `<div class="preview-row"><b>勤務形態:</b> ${get('workType')}</div>` : ''}
        ${get('detail') ? `<div class="preview-row"><b>詳細:</b> ${get('detail')}</div>` : ''}
        ${get('requirement') ? `<div class="preview-row"><b>必要な資格・経験:</b> ${get('requirement')}</div>` : ''}
    `;
    preview.style.display = 'block';
});

// 投稿処理
// ... existing code ...
document.getElementById('post-job-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const successMessage = document.getElementById('success-message');
    const errorMessage = document.getElementById('error-message');
    const warningMessage = document.getElementById('warning-message');
    const preview = document.getElementById('preview-card');
    successMessage.style.display = 'none';
    errorMessage.style.display = 'none';
    warningMessage.style.display = 'none';
    preview.style.display = 'none';
    if (!validateForm()) return;
    const get = id => document.getElementById(id).value.trim();
    const fields = {
        '企業名': get('company'),
        '職種': get('position'),
        '地域': get('region'),
        '勤務地': get('location'),
        '年収': Number(get('salary')),
        '応募ステータス': get('status'),
    };
    if (get('startDate')) fields['募集開始日'] = get('startDate');
    if (get('detail')) fields['詳細'] = get('detail');
    if (get('workType')) fields['勤務形態'] = get('workType');
    if (get('requirement')) fields['必要な資格・経験'] = get('requirement');
    // Airtable送信
    try {
        const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(JOBS_TABLE_NAME)}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ records: [{ fields }] })
        });
        if (!res.ok) throw new Error(await res.text());
        successMessage.style.display = 'block';
        document.getElementById('post-job-form').reset();
    } catch (error) {
        // CORS対応
        if (error.message.includes('CORS') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            try {
                const proxyRes = await fetch(`${PROXY_URL}https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(JOBS_TABLE_NAME)}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`,
                        'Content-Type': 'application/json',
                        'Origin': window.location.origin
                    },
                    body: JSON.stringify({ records: [{ fields }] })
                });
                if (!proxyRes.ok) throw new Error(await proxyRes.text());
                successMessage.style.display = 'block';
                document.getElementById('post-job-form').reset();
            } catch (proxyError) {
                warningMessage.style.display = 'block';
            }
        } else {
            errorMessage.innerHTML = `エラーが発生しました: ${error.message}<br>もう一度お試しください。`;
            errorMessage.style.display = 'block';
        }
    }
}); 