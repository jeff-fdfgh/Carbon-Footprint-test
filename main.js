/*  main.js – 以 ES module 方式載入，負責整個測驗流程 */

let questionBank = {};
const TOTAL_QUESTIONS = 50;
const TOTAL_POINTS   = 100;   //  (30+20)*2
const TIME_LIMIT_MIN = 90;    // 90 分鐘

//--------------------------------------------------
// 1. 先載入題庫 JSON
//--------------------------------------------------
(async function init() {
  const res = await fetch('questions.json');
  questionBank = await res.json();
  bindEvents();
})();

//--------------------------------------------------
// 2. 取得所有 DOM 物件
//--------------------------------------------------
const els = {};
function q(id){ return document.getElementById(id); }
[
  'start-screen','quiz-screen','result-screen','start-btn','question-number',
  'progress-bar','question-text','options-container','next-btn','prev-btn',
  'final-score','score-message','restart-btn','answer-key','timer',
  'result-title','result-subtitle','question-nav','confirm-modal',
  'confirm-msg','confirm-submit-btn','cancel-submit-btn'
].forEach(k=>els[k.replace(/-([a-z])/g, g=>g[1].toUpperCase())]=q(k));

let quizQuestions       = [];
let currentQuestionIdx  = 0;
let userAnswers         = [];
let timerInterval       = null;

//--------------------------------------------------
// 3. 公用工具
//--------------------------------------------------
function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}

//--------------------------------------------------
// 4. 題庫抽選
//--------------------------------------------------
function buildQuiz() {
  const single = shuffle([...questionBank.singleChoice]).slice(0,30);
  const multi  = shuffle([...questionBank.multipleChoice]).slice(0,20);
  quizQuestions = shuffle([...single, ...multi]);
  userAnswers   = quizQuestions.map(q => Array.isArray(q.answer)?[]:null);
}

//--------------------------------------------------
// 5. 倒數計時
//--------------------------------------------------
function startTimer(min){
  let timeLeft = min*60;
  els.timer.textContent = `${min}:00`;
  timerInterval = setInterval(()=>{
    const m = Math.floor(timeLeft/60);
    const s = (timeLeft%60).toString().padStart(2,'0');
    els.timer.textContent = `${m}:${s}`;
    if(--timeLeft < 0){
      clearInterval(timerInterval);
      processAndShowResults(true);
    }
  },1000);
}

//--------------------------------------------------
// 6. 畫面導覽列
//--------------------------------------------------
function buildNav(){
  els.questionNav.innerHTML='';
  quizQuestions.forEach((_,i)=>{
    const btn=document.createElement('button');
    btn.textContent=i+1;
    btn.className='nav-btn';
    btn.onclick=()=>goTo(i);
    els.questionNav.appendChild(btn);
  });
}
function updateNav(){
  [...els.questionNav.children].forEach((btn,i)=>{
    btn.classList.remove('current','answered');
    const ans=userAnswers[i];
    const answered=Array.isArray(ans)?ans.length>0:ans!==null;
    if(answered) btn.classList.add('answered');
    if(i===currentQuestionIdx) btn.classList.add('current');
  });
}

//--------------------------------------------------
// 7. 顯示題目
//--------------------------------------------------
function goTo(idx){
  if(idx<0||idx>=quizQuestions.length) return;
  currentQuestionIdx=idx;
  drawQuestion();
}
function drawQuestion(){
  updateNav();
  const q = quizQuestions[currentQuestionIdx];
  const isMulti = Array.isArray(q.answer);
  els.questionNumber.textContent=`${currentQuestionIdx+1} / ${TOTAL_QUESTIONS}`;
  els.progressBar.style.width = `${(currentQuestionIdx+1)/TOTAL_QUESTIONS*100}%`;
  els.questionText.textContent = q.question;
  els.optionsContainer.innerHTML = '';

  q.options.forEach(opt=>{
    const key = opt.charAt(0);   // "A." 的 A
    if(isMulti){
      const wrapper=document.createElement('div');
      wrapper.innerHTML=`
        <input type="checkbox" id="opt-${key}" value="${key}" class="hidden option-checkbox">
        <label for="opt-${key}" class="option-label border-gray-300 dark:border-gray-600">${opt}</label>`;
      const cb = wrapper.querySelector('input');
      if(userAnswers[currentQuestionIdx].includes(key)) cb.checked=true;
      cb.onchange=()=>{
        const selected=[...els.optionsContainer.querySelectorAll('input:checked')].map(i=>i.value);
        userAnswers[currentQuestionIdx]=selected;
        updateNav();
      };
      els.optionsContainer.appendChild(wrapper);
    }else{
      const btn=document.createElement('button');
      btn.className='option-label border-gray-300 dark:border-gray-600 option-btn';
      btn.textContent=opt;
      if(userAnswers[currentQuestionIdx]===key) btn.classList.add('selected');
      btn.onclick=()=>{
        userAnswers[currentQuestionIdx]=key;
        // 單選立即下一題
        if(currentQuestionIdx<TOTAL_QUESTIONS-1) goTo(currentQuestionIdx+1);
        updateNav();
      };
      els.optionsContainer.appendChild(btn);
    }
  });
}

//--------------------------------------------------
// 8. 成績計算
//--------------------------------------------------
function scoreQuiz(){
  let points=0;
  quizQuestions.forEach((q,i)=>{
    const ans = userAnswers[i];
    if(Array.isArray(q.answer)){           // 複選題：部分給分
      const correctSet   = new Set(q.answer);
      const chosenSet    = new Set(ans);
      const nCorrectHit  = [...chosenSet].filter(x=>correctSet.has(x)).length;
      const nWrongChosen = [...chosenSet].filter(x=>!correctSet.has(x)).length;
      const singleScore  = (nCorrectHit - nWrongChosen) / correctSet.size;
      points += Math.max(0,singleScore) * q.points;
    }else{                                 // 單選題
      if(ans===q.answer) points+=q.points;
    }
  });
  return points;
}

//--------------------------------------------------
// 9. 顯示結果
//--------------------------------------------------
function processAndShowResults(timeout=false){
  clearInterval(timerInterval);
  els.quizScreen.classList.add('hidden');
  els.resultScreen.classList.remove('hidden');

  const got = Math.round(scoreQuiz());
  els.finalScore.textContent = `${got} / ${TOTAL_POINTS}`;
  els.resultTitle.textContent = timeout ? '時間到！' : '測驗結束！';
  els.resultSubtitle.textContent = timeout ? '已自動提交試卷' : '';
  els.scoreMessage.textContent = got>=80? '恭喜，成績優異！':'尚有進步空間，請再接再厲！';

  // 答案詳解
  els.answerKey.innerHTML='';
  quizQuestions.forEach((q,i)=>{
    const div=document.createElement('div');
    const ua=userAnswers[i];
    const correct=Array.isArray(q.answer)?q.answer.join(', '):q.answer;
    const chosen = Array.isArray(ua)?ua.join(', '):(ua??'—');
    div.innerHTML=`
      <p class="font-semibold mb-1">Q${i+1}. ${q.question}</p>
      <p class="text-sm mb-0"><span class="text-green-600 font-semibold">正確：</span>${correct}</p>
      <p class="text-sm"><span class="text-blue-600 font-semibold">你的答案：</span>${chosen}</p>`;
    els.answerKey.appendChild(div);
  });
}

//--------------------------------------------------
// 10. 事件綁定
//--------------------------------------------------
function bindEvents(){
  els.startBtn.onclick = ()=>{
    buildQuiz();
    els.startScreen.classList.add('hidden');
    els.quizScreen.classList.remove('hidden');
    buildNav();
    goTo(0);
    startTimer(TIME_LIMIT_MIN);
  };
  els.nextBtn.onclick = ()=>goTo(currentQuestionIdx+1);
  els.prevBtn.onclick = ()=>goTo(currentQuestionIdx-1);
  els.restartBtn.onclick = ()=>{
    els.resultScreen.classList.add('hidden');
    els.startScreen.classList.remove('hidden');
  };

  // 提交確認
  els.confirmSubmitBtn.onclick = ()=>{
    els.confirmModal.classList.add('hidden');
    processAndShowResults(false);
  };
  els.cancelSubmitBtn.onclick  = ()=>{
    els.confirmModal.classList.add('hidden');
  };

  // 快捷鍵：最後一題點下一題 → 彈出提交確認
  els.nextBtn.addEventListener('click',()=>{
    if(currentQuestionIdx===TOTAL_QUESTIONS-1){
      els.confirmMsg.textContent='已經是最後一題，確定要提交嗎？';
      els.confirmModal.classList.remove('hidden');
    }
  });
}

//--------------------------------------------------
// 11. dark mode（可自行加切換開關）
//--------------------------------------------------
// document.documentElement.classList.add('dark');
