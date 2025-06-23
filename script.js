// Airtable API設定
const AIRTABLE_API_TOKEN = 'patV6se7KmGamuWT7.451356d3945a45135d354b363a2abd6d9c4d1ce9f74b0cdabee77f8dd055ddbb';
const AIRTABLE_BASE_ID = 'appD06KJ0je7fo62a';
const JOBS_TABLE_NAME = '求人';
const APPLICATION_TABLE_NAME = '応募履歴';
const PROXY_URL = 'https://cors-anywhere.herokuapp.com/';

// DOM取得
const jobListSection = document.getElementById('job-list-section');
const applicationSection = document.getElementById('application-section');
const jobsList = document.getElementById('jobsList');
const jobCount = document.getElementById('jobCount');
const loadingMessage = document.getElementById('loadingMessage');
const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');

// 応募フォームDOM
const selectedJobCard = document.getElementById('selected-job-card');
const applicationForm = document.getElementById('application-form');

// 求人一覧取得
async function fetchJobs() {
    const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(JOBS_TABLE_NAME)}`, {
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_TOKEN}` }
    });
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    const data = await response.json();
    return data.records;
}

// 求人カードHTML生成
function createJobCard(job) {
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
}

// 求人一覧表示
async function displayJobs() {
    try {
        const jobs = await fetchJobs();
        loadingMessage.style.display = 'none';
        jobCount.textContent = jobs.length;
        jobsList.innerHTML = jobs.map(createJobCard).join('');
    } catch (error) {
        errorMessage.textContent = '求人データの取得に失敗しました。APIキーとBase IDを確認してください。';
        errorMessage.style.display = 'block';
        loadingMessage.style.display = 'none';
    }
}

// 応募フォームに求人情報を反映
function showApplicationForm(jobData) {
    // カード情報反映
    selectedJobCard.querySelector('.company').textContent = jobData.company || '企業名未設定';
    selectedJobCard.querySelector('.position').textContent = jobData.position || '職種未設定';
    const details = selectedJobCard.querySelector('.job-details');
    details.innerHTML = '';
    if (jobData.region) details.innerHTML += `<div class="detail-item"><div class="detail-icon">📍</div><span>${jobData.region}</span></div>`;
    if (jobData.salary) details.innerHTML += `<div class="detail-item"><div class="detail-icon">💰</div><span>年収${jobData.salary}万円</span></div>`;
    if (jobData.location) details.innerHTML += `<div class="detail-item"><div class="detail-icon">🏢</div><span>${jobData.location}</span></div>`;
    // 応募フォームのhiddenに求人ID等をセット
    applicationForm.dataset.jobId = jobData.jobId || '';
    applicationForm.dataset.company = jobData.company || '';
    applicationForm.dataset.position = jobData.position || '';
    // 切り替え
    jobListSection.style.display = 'none';
    applicationSection.style.display = 'block';
    document.querySelector('.application-form').style.display = 'block';
}

// 応募フォームバリデーション
function validateForm() {
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const message = document.getElementById('message').value.trim();
    let isValid = true;
    if (!name) { document.getElementById('name-error').style.display = 'block'; isValid = false; } else { document.getElementById('name-error').style.display = 'none'; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) { document.getElementById('email-error').style.display = 'block'; isValid = false; } else { document.getElementById('email-error').style.display = 'none'; }
    if (!message) { document.getElementById('message-error').style.display = 'block'; isValid = false; } else { document.getElementById('message-error').style.display = 'none'; }
    return isValid;
}

// Airtableに応募履歴を記録
async function recordApplication({company, position, jobId}, name, email, message) {
    try {
        const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(APPLICATION_TABLE_NAME)}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`, 'Content-Type': 'application/json' },
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
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }
        return true;
    } catch (error) {
        // CORSエラーの場合、プロキシサーバーを試す
        if (error.message.includes('CORS') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            try {
                const proxyResponse = await fetch(`${PROXY_URL}https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(APPLICATION_TABLE_NAME)}`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`, 'Content-Type': 'application/json', 'Origin': window.location.origin },
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
                if (!proxyResponse.ok) {
                    const errorText = await proxyResponse.text();
                    throw new Error(`HTTP error! status: ${proxyResponse.status} - ${errorText}`);
                }
                return true;
            } catch (proxyError) {
                if (proxyError.message.includes('429') || proxyError.message.includes('Too Many Requests')) {
                    throw new Error('PROXY_ERROR');
                }
                throw new Error('CORS_ERROR');
            }
        }
        throw error;
    }
}

// 応募フォーム送信イベント
if (applicationForm) {
    applicationForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        if (!validateForm()) return;
        const sMsg = document.getElementById('success-message');
        const eMsg = document.getElementById('error-message');
        const wMsg = document.getElementById('warning-message');
        const applyBtn = document.getElementById('apply-btn');
        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        const message = document.getElementById('message').value.trim();
        const jobData = {
            company: applicationForm.dataset.company,
            position: applicationForm.dataset.position,
            jobId: applicationForm.dataset.jobId
        };
        applyBtn.disabled = true;
        applyBtn.textContent = '応募中...';
        sMsg.style.display = 'none';
        eMsg.style.display = 'none';
        wMsg.style.display = 'none';
        try {
            const success = await recordApplication(jobData, name, email, message);
            if (success) {
                sMsg.style.display = 'block';
                applyBtn.textContent = '応募完了';
                applyBtn.style.background = '#48bb78';
                applicationForm.reset();
                setTimeout(() => {
                    // 応募完了後は一覧に戻る
                    applicationSection.style.display = 'none';
                    jobListSection.style.display = 'block';
                    applyBtn.textContent = '応募する';
                    applyBtn.style.background = '';
                }, 2000);
            } else {
                eMsg.style.display = 'block';
                applyBtn.textContent = '応募する';
                applyBtn.disabled = false;
            }
        } catch (error) {
            if (error.message === 'CORS_ERROR') {
                wMsg.innerHTML = 'CORSエラーのため、ローカル環境ではAirtableへの記録ができません。<br>実際のサーバー環境でご利用ください。';
                wMsg.style.display = 'block';
            } else if (error.message === 'PROXY_ERROR') {
                wMsg.innerHTML = 'プロキシサーバーの制限により、一時的に利用できません。<br>しばらく時間をおいてから再試行してください。';
                wMsg.style.display = 'block';
            } else {
                eMsg.innerHTML = `エラーが発生しました: ${error.message}<br>もう一度お試しください。`;
                eMsg.style.display = 'block';
            }
            applyBtn.textContent = '応募する';
            applyBtn.disabled = false;
        }
    });
}

// 求人カードクリックで応募フォーム表示
if (jobsList) {
    jobsList.addEventListener('click', function(e) {
        const card = e.target.closest('.job-card');
        if (card && e.target.classList.contains('apply-btn')) {
            const jobData = JSON.parse(card.getAttribute('data-job'));
            showApplicationForm(jobData);
        }
    });
}

document.addEventListener('DOMContentLoaded', displayJobs);