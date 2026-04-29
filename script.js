import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// -- 사용자님의 Firebase Config 암호 데이터 --
const firebaseConfig = {
  apiKey: "AIzaSyDjDJ7oVX_jRTForgM62ADe1Odd__0OXlc",
  authDomain: "myscheduleapp-47253.firebaseapp.com",
  projectId: "myscheduleapp-47253",
  storageBucket: "myscheduleapp-47253.firebasestorage.app",
  messagingSenderId: "261371315913",
  appId: "1:261371315913:web:f66594f4016270a98c6f18"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', () => {

    // --- 자체 윈도우/사파리 시스템 알림 추가 권한 ---
    const notiBtn = document.getElementById('noti-permission-btn');
    if ("Notification" in window && Notification.permission === "granted") {
        notiBtn.style.display = 'none'; // 이미 켜져있으면 숨김
    }
    notiBtn.addEventListener('click', () => {
        if ("Notification" in window) {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    showToast("🔔 강력한 시스템 알람이 켜졌습니다!");
                    notiBtn.style.display = 'none';
                } else {
                    showToast("⚠️ 알람 권한이 거부되었습니다.");
                }
            });
        }
    });

    // --- 카카오 API 연동 파트 ---
    if (!Kakao.isInitialized()) {
        Kakao.init('b06e0bf0a7b472416354ead3cd92586c');
    }
    const kakaoLoginBtn = document.getElementById('kakao-login-btn');
    let isKakaoLinked = false;

    function updateKakaoUI() {
        if (isKakaoLinked) {
            kakaoLoginBtn.innerHTML = '<i class="fa-solid fa-check"></i> 카카오 연동됨';
            kakaoLoginBtn.classList.add('logged-in');
        } else {
            kakaoLoginBtn.innerHTML = '<i class="fa-solid fa-comment"></i> 카카오 연동하기';
            kakaoLoginBtn.classList.remove('logged-in');
        }
    }

    // Access Token 갱신 함수 (Refresh Token 사용)
    async function refreshKakaoToken() {
        const refreshToken = localStorage.getItem('kakao_refresh_token');
        if (!refreshToken) return false;
        try {
            const res = await fetch('https://kauth.kakao.com/oauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `grant_type=refresh_token&client_id=b06e0bf0a7b472416354ead3cd92586c&refresh_token=${refreshToken}`
            });
            const data = await res.json();
            if (data.access_token) {
                Kakao.Auth.setAccessToken(data.access_token);
                localStorage.setItem('kakao_access_token', data.access_token);
                localStorage.setItem('kakao_token_expiry', Date.now() + (data.expires_in * 1000));
                if (data.refresh_token) {
                    localStorage.setItem('kakao_refresh_token', data.refresh_token);
                }
                return true;
            }
        } catch(e) { console.error('토큰 갱신 실패:', e); }
        return false;
    }

    // 앱 시작 시 저장된 토큰으로 자동 로그인 시도
    async function tryAutoLogin() {
        const savedToken = localStorage.getItem('kakao_access_token');
        const expiry = parseInt(localStorage.getItem('kakao_token_expiry') || '0');
        const refreshToken = localStorage.getItem('kakao_refresh_token');

        if (!savedToken && !refreshToken) return; // 저장된 정보 없으면 패스

        if (savedToken && expiry > Date.now()) {
            // 토큰 아직 유효 → 바로 복원
            Kakao.Auth.setAccessToken(savedToken);
            isKakaoLinked = true;
            updateKakaoUI();
            showToast("✅ 카카오 자동 연동 완료!");
        } else if (refreshToken) {
            // 만료됐지만 Refresh Token 있음 → 자동 갱신
            const ok = await refreshKakaoToken();
            if (ok) {
                isKakaoLinked = true;
                updateKakaoUI();
                showToast("🔄 카카오 토큰 자동 갱신 완료!");
            } else {
                // Refresh Token도 만료(60일) → 어쩔 수 없이 재로그인
                localStorage.removeItem('kakao_access_token');
                localStorage.removeItem('kakao_refresh_token');
                localStorage.removeItem('kakao_token_expiry');
                updateKakaoUI();
            }
        }
    }
    tryAutoLogin();

    kakaoLoginBtn.addEventListener('click', () => {
        if (isKakaoLinked) return;
        Kakao.Auth.login({
            scope: 'talk_calendar',
            success: function(authObj) {
                // 토큰 정보를 localStorage에 저장
                localStorage.setItem('kakao_access_token', authObj.access_token);
                localStorage.setItem('kakao_refresh_token', authObj.refresh_token);
                localStorage.setItem('kakao_token_expiry', Date.now() + (authObj.expires_in * 1000));
                isKakaoLinked = true;
                updateKakaoUI();
                showToast("✅ 카카오 캘린더 연동 완료! 이제 죠르디가 알림을 담당합니다.");
            },
            fail: function(err) { alert("연동 실패: " + JSON.stringify(err)); }
        });
    });

    const dateElement = document.getElementById('current-date');
    const taskInput = document.getElementById('task-input');
    const taskTimeInput = document.getElementById('task-time');

    // UI 상에서 분(minute)을 강제로 5분 단위로 스냅(자석 효과)
    taskTimeInput.addEventListener('change', function() {
        if (this.value) {
            let parts = this.value.split(':');
            if (parts.length === 2) {
                let d = new Date();
                d.setHours(parseInt(parts[0], 10));
                d.setMinutes(Math.round(parseInt(parts[1], 10) / 5) * 5);
                this.value = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
            }
        }
    });

    const addBtn = document.getElementById('add-btn');
    const taskList = document.getElementById('task-list');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');

    const calMonthYear = document.getElementById('calendar-month-year');
    const calDaysGrid = document.getElementById('calendar-days');
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');
    const goTodayBtn = document.getElementById('go-today-btn');

    const alarmOverlay = document.getElementById('alarm-overlay');
    const alarmText = document.getElementById('alarm-text');
    const closeAlarmBtn = document.getElementById('close-alarm-btn');
    const toastContainer = document.getElementById('toast-container');

    let currentDate = new Date(); 
    let currentCalMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1); 
    const dateOptions = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
    
    // --- [V2] 클라우드 DB 데이터 로드 (실시간) ---
    let tasksByDate = {};
    
    // 이 함수가 실행되는 순간, 서버 DB에 변화가 생길 때마다 0.1초만에 화면이 자동으로 다시 그려집니다 (동기화)
    function loadDataFromCloud() {
        onSnapshot(collection(db, "tasks"), (snapshot) => {
            tasksByDate = {}; 
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                if (!tasksByDate[data.dateStr]) tasksByDate[data.dateStr] = [];
                tasksByDate[data.dateStr].push({ ...data, docId: docSnap.id });
            });
            updateMainSchedule();
            renderCalendar();
        }, (error) => {
            console.error("Firebase read error:", error);
            // 권한 에러 등이 터지면 토스트 띄우기
        });
    }

    const getDateString = (d) => {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast'; toast.textContent = message;
        toastContainer.appendChild(toast); setTimeout(() => toast.remove(), 3000);
    }

    function renderCalendar() {
        const year = currentCalMonth.getFullYear(); const month = currentCalMonth.getMonth();
        calMonthYear.textContent = `${year}. ${String(month + 1).padStart(2, '0')}`;
        calDaysGrid.innerHTML = '';
        const firstDayOfMonth = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
        const realToday = new Date(); 

        for (let i = 0; i < firstDayOfMonth; i++) { calDaysGrid.appendChild(Object.assign(document.createElement('div'), { className: 'cal-day empty' })); }

        for (let idx = 1; idx <= daysInMonth; idx++) {
            const dayDiv = document.createElement('div'); const loopDateStr = getDateString(new Date(year, month, idx));
            dayDiv.className = 'cal-day'; dayDiv.textContent = idx;
            if (new Date(year, month, idx).getDay() === 0) dayDiv.classList.add('sunday');
            if (loopDateStr === getDateString(realToday)) dayDiv.classList.add('today');
            if (loopDateStr === getDateString(currentDate)) dayDiv.classList.add('selected');

            const dayTasks = tasksByDate[loopDateStr] || [];
            if (dayTasks.some(t => !t.completed)) {
                const dot = document.createElement('div'); dot.className = 'task-dot'; dayDiv.appendChild(dot);
            }

            dayDiv.addEventListener('click', () => { currentDate = new Date(year, month, idx); updateMainSchedule(); renderCalendar(); });
            calDaysGrid.appendChild(dayDiv);
        }
    }

    function updateMainSchedule() {
        dateElement.style.opacity = 0;
        setTimeout(() => { dateElement.textContent = currentDate.toLocaleDateString('ko-KR', dateOptions); dateElement.style.opacity = 1; }, 150);
        
        taskList.innerHTML = ''; const currentString = getDateString(currentDate); let tasks = tasksByDate[currentString] || [];
        tasks.sort((a, b) => { if (a.completed === b.completed) return 0; return a.completed ? 1 : -1; });

        if (tasks.length === 0) {
            taskList.innerHTML = '<li style="text-align:center; color:var(--text-muted); padding:3rem 1rem; font-size:1.1rem; opacity:0; animation:fadeIn 0.5s ease forwards">해당 날짜에 기록된 일정이 없습니다.</li>';
            return;
        }

        tasks.forEach((task) => {
            const li = document.createElement('li');
            li.className = `task-item ${task.completed ? 'completed' : ''}`; li.style.animation = `fadeIn 0.3s ease-out forwards`; li.style.opacity = '0'; 

            let timeBadgeHtml = task.time ? `<div class="task-time-badge"><i class="fa-regular fa-bell"></i> ${task.time}</div>` : '';
            li.innerHTML = `
                <div class="custom-checkbox" onclick="toggleTask('${task.id}', '${task.docId}')"><i class="fa-solid fa-check"></i></div>
                <span class="task-text">${task.text}</span> ${timeBadgeHtml}
                <button class="delete-btn" onclick="deleteTask('${task.id}', '${task.docId}')"><i class="fa-solid fa-trash-can"></i></button>`;
            taskList.appendChild(li);
        });
    }

    goTodayBtn.addEventListener('click', () => { currentDate = new Date(); currentCalMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1); updateMainSchedule(); renderCalendar(); showToast("오늘로 이동했습니다."); });
    prevBtn.addEventListener('click', () => { currentDate.setDate(currentDate.getDate() - 1); syncCalendarMonth(); updateMainSchedule(); renderCalendar(); });
    nextBtn.addEventListener('click', () => { currentDate.setDate(currentDate.getDate() + 1); syncCalendarMonth(); updateMainSchedule(); renderCalendar(); });
    prevMonthBtn.addEventListener('click', () => { currentCalMonth.setMonth(currentCalMonth.getMonth() - 1); renderCalendar(); });
    nextMonthBtn.addEventListener('click', () => { currentCalMonth.setMonth(currentCalMonth.getMonth() + 1); renderCalendar(); });
    function syncCalendarMonth() { if (currentCalMonth.getFullYear() !== currentDate.getFullYear() || currentCalMonth.getMonth() !== currentDate.getMonth()) currentCalMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1); }

    // --- [V2] 클라우드 DB 연동 데이터 쓰기 ---
    addBtn.addEventListener('click', async () => {
        const text = taskInput.value.trim(); let timeVal = taskTimeInput.value; 
        if (text) {
            const strDate = getDateString(currentDate);
            const newId = Date.now().toString();

            // --- [NEW] 카카오 톡캘린더 자동 등록 로직 ---
            if (isKakaoLinked && timeVal) {
                const eventDate = new Date(`${strDate}T${timeVal}:00`);
                if (!isNaN(eventDate.getTime())) {
                    // 카카오 캘린더 정책에 맞추어 5분 단위로 자동 반올림 (예: 13:32 -> 13:30)
                    let roundedMinutes = Math.round(eventDate.getMinutes() / 5) * 5;
                    eventDate.setMinutes(roundedMinutes);
                    timeVal = String(eventDate.getHours()).padStart(2, '0') + ':' + String(eventDate.getMinutes()).padStart(2, '0');

                    const isoStart = eventDate.toISOString();
                    const isoEnd = new Date(eventDate.getTime() + 30 * 60000).toISOString();
                    const eventData = {
                        title: `⏰ [예약 스케줄] ${text}`,
                        description: "새로운 클라우드 일정이 등록되었습니다.",
                        time: { start_at: isoStart, end_at: isoEnd, time_zone: "Asia/Seoul", all_day: false },
                        reminders: [0] // 정각(0분 전) 죠르디 알람
                    };
                    
                    const accessToken = Kakao.Auth.getAccessToken();
                    fetch('https://kapi.kakao.com/v2/api/calendar/create/event', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Authorization': `Bearer ${accessToken}`
                        },
                        body: `event=${encodeURIComponent(JSON.stringify(eventData))}`
                    })
                    .then(res => res.json())
                    .then(data => {
                        if(data.event_id) {
                            console.log('캘린더 등록성공:', data); 
                            showToast("📅 톡캘린더 연동 완료! (죠르디 대기중)");
                        } else if (data.code === -401) {
                            console.error('토큰 만료, 자동 갱신 시도:', data);
                            // 자동으로 Refresh Token으로 재시도
                            refreshKakaoToken().then(ok => {
                                if (ok) {
                                    showToast("🔄 토큰 자동 갱신 완료! 일정을 다시 추가해주세요.");
                                } else {
                                    isKakaoLinked = false;
                                    localStorage.removeItem('kakao_access_token');
                                    localStorage.removeItem('kakao_refresh_token');
                                    localStorage.removeItem('kakao_token_expiry');
                                    updateKakaoUI();
                                    showToast("⚠️ 60일 이상 미접속으로 재로그인이 필요합니다.");
                                }
                            });
                        } else {
                            console.error('캘린더 거절에러:', data); 
                            showToast("⚠️ 캘린더 등록 실패 (동의 권한 확인)");
                        }
                    })
                    .catch(err => {
                        console.error('캘린더 통신 에러:', err); 
                        showToast("⚠️ 카카오 서버 통신 에러가 발생했습니다.");
                    });
                }
            }

            try {
                // 클라우드 서버로 데이터를 쏜다
                await setDoc(doc(db, "tasks", newId), {
                    id: newId, text: text, completed: false, time: timeVal || null,
                    dateStr: strDate, alarmNotified: false, createdAt: Date.now()
                });
                taskInput.value = ''; taskTimeInput.value = ''; 
                showToast("☁️ 일정이 클라우드에 퍼블리싱 되었습니다.");
            } catch(e) {
                console.error(e);
                showToast("⚠️ 저장 실패! Firestore 데이터베이스가 세팅되지 않았습니다.");
            }
        }
    });

    taskInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addBtn.click(); });
    
    // --- [V2] 클라우드 데이터 수정/삭제 ---
    window.toggleTask = async (id, docId) => { 
        const str = getDateString(currentDate); if(!tasksByDate[str]) return; 
        const task = tasksByDate[str].find(t => t.id === id); 
        if (task) { 
            await updateDoc(doc(db, "tasks", docId), { completed: !task.completed });
        } 
    };
    window.deleteTask = async (id, docId) => { 
        if (event) { 
            const item = event.target.closest('.task-item'); 
            if (item) { 
                item.style.transform = 'scale(0.95)'; item.style.opacity = '0'; 
                setTimeout(async () => { 
                    await deleteDoc(doc(db, "tasks", docId)); showToast("☁️ 클라우드에서 영구 삭제됨"); 
                }, 300); 
            } 
        } 
    };

    // --- 시간 감지 및 알람 구동 ---
    const playBeep = () => { try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination); osc.type = "sine"; osc.frequency.setValueAtTime(880, ctx.currentTime); gain.gain.setValueAtTime(0.05, ctx.currentTime); osc.start(); setTimeout(() => osc.stop(), 500); } catch(e) {} }

    closeAlarmBtn.addEventListener('click', () => { alarmOverlay.classList.add('hidden'); });

    setInterval(() => {
        const now = new Date(); const strDate = getDateString(now); const tasksToday = tasksByDate[strDate];
        if (!tasksToday) return;

        const currentHM = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

        tasksToday.forEach(task => {
            if (task.time === currentHM && !task.completed && !task.alarmNotified) {
                // 클라우드 상에서도 알람 울림 처리
                updateDoc(doc(db, "tasks", task.docId), { alarmNotified: true });

                alarmText.textContent = task.text;
                alarmOverlay.classList.remove('hidden');
                playBeep();
                
                if ("Notification" in window && Notification.permission === "granted") {
                    new Notification("⏰ 프리미엄 스케줄러", {
                        body: task.text + "\n설정하신 일정이 도달했습니다!", icon: "https://cdn-icons-png.flaticon.com/512/825/825590.png"
                    });
                }
            }
        });
    }, 5000); 

    // 초기 실행
    loadDataFromCloud();
});
