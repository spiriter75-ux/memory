/**
 * 덤프트럭 운전자 안전교육 웹 워크벤치 프론트엔드 (src/static/app.js)
 * - 16:9 2-Column 인터랙티브 비주얼 캔버스 및 컨트롤러 제어
 * - 4분할 그리드, 50:50 전후 비교 슬라이더, 3D 비디오 플레이어
 * - 9대 QC 검증, Winner 승인, 엑셀 대장 즉시 출력 연동
 */

const STATE = {
  scenarioId: 8,
  scenarios: [],
  detectedPresets: {},
  candidates: [],
  selectedCandidate: null,
  qwenResult: null,
  visualMode: 'grid', // 'grid' | 'slider' | 'video'
  aspectRatio: '9:16', // '9:16' | '16:9'
  qcRules: [],
  qcChecks: {},
  winnerPath: null
};

// DOM 로드 완료 시 초기화
document.addEventListener('DOMContentLoaded', async () => {
  initSliderDrag();
  await checkSystemStatus();
  await loadScenarios();
  await loadQcRules();
  await loadManifest();
  setupQuickButtons();
});

// ---------- 초기 데이터 로드 ----------

async function checkSystemStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    const badge = document.getElementById('serverStatusBadge');
    if (data.comfyui && data.comfyui.online) {
      badge.className = 'badge-tag live-badge';
      badge.innerHTML = '<span class="status-dot"></span> ComfyUI 실서버 연결됨';
    } else {
      badge.className = 'badge-tag mode-badge';
      badge.innerHTML = '<span class="status-dot" style="background:#3b82f6;"></span> 로컬 오프라인 모의 엔진 가동';
    }
  } catch (e) {
    console.warn('상태 조회 실패:', e);
  }
}

async function loadScenarios() {
  try {
    const res = await fetch('/api/scenarios');
    const data = await res.json();
    STATE.scenarios = data.scenarios || [];

    const select = document.getElementById('scenarioSelect');
    select.innerHTML = '';

    STATE.scenarios.forEach(sc => {
      const opt = document.createElement('option');
      opt.value = sc.num;
      opt.textContent = `[#${sc.num}] ${sc.title} (${sc.category_title})`;
      if (sc.num === STATE.scenarioId) opt.selected = true;
      select.appendChild(opt);
    });

    await onScenarioChanged();
  } catch (e) {
    console.error('시나리오 로드 오류:', e);
  }
}

async function loadQcRules() {
  try {
    const res = await fetch('/api/qc/rules');
    STATE.qcRules = await res.json();

    const container = document.getElementById('qcChecklist');
    container.innerHTML = '';

    STATE.qcRules.forEach(rule => {
      STATE.qcChecks[rule.id] = true; // 기본 통과 체크

      const item = document.createElement('div');
      item.className = 'qc-item checked';
      item.id = `qcItem_${rule.id}`;

      item.innerHTML = `
        <input type="checkbox" id="chk_${rule.id}" checked onchange="toggleQcItem('${rule.id}')">
        <span class="qc-code">${rule.id}</span>
        <span class="qc-text" title="${rule.description}">${rule.name}</span>
      `;
      container.appendChild(item);
    });
  } catch (e) {
    console.error('QC 규칙 로드 오류:', e);
  }
}

async function loadManifest() {
  try {
    const res = await fetch('/api/manifest');
    const manifest = await res.json();

    // 현재 시나리오의 Winner 확인
    const winInfo = manifest.winners && manifest.winners[String(STATE.scenarioId)];
    if (winInfo) {
      STATE.winnerPath = winInfo.winner_path;
      updateWinnerBadge(true, winInfo.winner_path);
    }
  } catch (e) {
    console.warn('매니페스트 로드 실패:', e);
  }
}

function setupQuickButtons() {
  document.querySelectorAll('.quick-scene-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.quick-scene-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const scId = parseInt(btn.dataset.id, 10);
      document.getElementById('scenarioSelect').value = scId;
      onScenarioChanged();
    });
  });
}

// ---------- 시나리오 전환 이벤트 ----------

async function onScenarioChanged() {
  const select = document.getElementById('scenarioSelect');
  STATE.scenarioId = parseInt(select.value, 10);

  try {
    const res = await fetch(`/api/scenarios/${STATE.scenarioId}`);
    const data = await res.json();
    STATE.detectedPresets = data.detected_presets || {};

    const sc = data.scenario || {};
    document.getElementById('metaLegalBasis').textContent = sc.legal_basis || '산업안전보건법 및 건설기계 안전기준';
    document.getElementById('metaRiskType').textContent = sc.risk_type || '현장 안전';
    document.getElementById('metaCauseCrisis').textContent = `${sc.cause || ''} ${sc.crisis || ''}`.trim() || '시나리오 상세 내용';

    // 위너 상태 초기화/로드
    await loadManifest();
  } catch (e) {
    console.error('시나리오 상세 로드 실패:', e);
  }
}

// ---------- 1차 Krea 4분할 후보 생성 ----------

async function generateKreaCandidates() {
  const count = parseInt(document.getElementById('kreaCount').value, 10) || 4;
  const seed = parseInt(document.getElementById('kreaSeed').value, 10) || 1000;

  showModal('1차 Krea 후보 생성 중...', 'Krea 2 Turbo 8-step 고속 렌더링으로 4분할 후보를 생성하고 있습니다.');

  try {
    const res = await fetch('/api/krea/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenario_id: STATE.scenarioId,
        count: count,
        base_seed: seed,
        aspect: STATE.aspectRatio
      })
    });

    const data = await res.json();
    hideModal();

    if (data.status === 'SUCCESS' && data.candidates) {
      STATE.candidates = data.candidates;
      renderCandidateGrid();
      setVisualMode('grid');

      // 1번 후보 자동 선택
      if (STATE.candidates.length > 0) {
        selectCandidate(STATE.candidates[0]);
      }
    }
  } catch (e) {
    hideModal();
    alert('후보 생성 중 오류가 발생했습니다: ' + e.message);
  }
}

function renderCandidateGrid() {
  const grid = document.getElementById('candidateGrid');
  grid.innerHTML = '';

  STATE.candidates.forEach((cand, idx) => {
    const item = document.createElement('div');
    item.className = 'grid-item' + (STATE.selectedCandidate && STATE.selectedCandidate.candidate_id === cand.candidate_id ? ' selected' : '');
    item.id = `candItem_${cand.candidate_id}`;
    item.onclick = () => selectCandidate(cand);

    item.innerHTML = `
      <img src="${cand.url}?t=${Date.now()}" alt="Candidate ${idx+1}">
      <span class="candidate-badge">후보 #${idx+1}</span>
      <span class="candidate-seed">Seed: ${cand.seed}</span>
    `;
    grid.appendChild(item);
  });
}

function selectCandidate(cand) {
  STATE.selectedCandidate = cand;

  document.querySelectorAll('.grid-item').forEach(el => el.classList.remove('selected'));
  const selectedEl = document.getElementById(`candItem_${cand.candidate_id}`);
  if (selectedEl) selectedEl.classList.add('selected');

  document.getElementById('canvasSelectionText').textContent =
    `선택된 후보: #${cand.index} (Seed: ${cand.seed}) • 경로: ${cand.path}`;

  // 슬라이더 Before 이미지 업데이트
  document.getElementById('imgBefore').src = cand.url;
}

// ---------- 2차 Qwen 고증 및 다각도 리터칭 ----------

function selectQwenPreset(presetKey) {
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`.preset-btn[data-key="${presetKey}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  const presetTexts = {
    plate_and_helmet: "Add an orange South Korean commercial construction equipment license plate to the front bumper. Ensure the driver is wearing a clean white safety helmet and hi-vis orange reflective vest.",
    wheel_chocks: "Place heavy yellow wedge wheel chocks firmly beneath the rear tandem tires on the ground to prevent rolling.",
    hangul_signs: "Add South Korean construction site safety warning signs in clear Hangul: '안전제일' and '서행 10km/h'.",
    air_tank_inspection: "Highlight the chassis air tank and pneumatic brake lines with clear inspection pressure gauge indicator.",
    angle_front_quarter: "Change camera perspective to 45-degree front-left three-quarter angle, clearly displaying flat cabin and side bed.",
    angle_side_profile: "Change camera perspective to full side profile view showing all 4 axles and 8 wheels clearly.",
    angle_rear_spotter: "Change camera perspective to rear view, showing a dedicated safety spotter with illuminated red light baton.",
    angle_driver_pov: "Change camera perspective to interior driver cabin first-person POV looking at right blindspot mirror."
  };

  document.getElementById('qwenInstructionText').value = presetTexts[presetKey] || '';
}

async function applyQwenRefinement() {
  if (!STATE.selectedCandidate) {
    alert('고증을 적용할 대상 후보 이미지를 먼저 선택해주세요!');
    return;
  }

  const activeBtn = document.querySelector('.preset-btn.active');
  const presetKey = activeBtn ? activeBtn.dataset.key : 'plate_and_helmet';
  const customText = document.getElementById('qwenInstructionText').value.trim();

  showModal('2차 Qwen 고증 리터칭 중...', `Qwen-Rapid-AIO + Lightning 8-step LoRA로 [${presetKey}] 고증 요소를 정밀 합성 중입니다.`);

  try {
    const res = await fetch('/api/qwen/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidate_path: STATE.selectedCandidate.path,
        edit_preset: presetKey,
        custom_instruction: customText || undefined,
        seed: 2026
      })
    });

    const data = await res.json();
    hideModal();

    if (data.status === 'SUCCESS') {
      STATE.qwenResult = data;

      document.getElementById('imgBefore').src = data.before_url + '?t=' + Date.now();
      document.getElementById('imgAfter').src = data.after_url + '?t=' + Date.now();

      // 슬라이더 모드로 즉시 전환
      setVisualMode('slider');

      // 리터칭된 이미지를 현재 활성 선택본으로 지정
      STATE.selectedCandidate = {
        path: data.after_path,
        url: data.after_url,
        candidate_id: 'qwen_refined_' + Date.now()
      };
      document.getElementById('canvasSelectionText').textContent =
        `선택된 후보: Qwen 고증 완료본 (${presetKey})`;
    }
  } catch (e) {
    hideModal();
    alert('Qwen 리터칭 중 오류가 발생했습니다: ' + e.message);
  }
}

// ---------- 9대 QC 체크리스트 및 Winner 승인 ----------

function toggleQcItem(ruleId) {
  const chk = document.getElementById(`chk_${ruleId}`);
  const item = document.getElementById(`qcItem_${ruleId}`);
  STATE.qcChecks[ruleId] = chk.checked;

  if (chk.checked) {
    item.classList.add('checked');
  } else {
    item.classList.remove('checked');
  }
}

async function approveWinnerCandidate() {
  if (!STATE.selectedCandidate) {
    alert('최종 Winner로 승인할 이미지를 먼저 선택해주세요!');
    return;
  }

  // QC 체크 여부 확인
  const unpassed = Object.entries(STATE.qcChecks).filter(([_, v]) => !v);
  if (unpassed.length > 0) {
    const confirmApprove = confirm(`경고: ${unpassed.length}개 QC 검증 항목이 체크되지 않았습니다. 그대로 승인하시겠습니까?`);
    if (!confirmApprove) return;
  }

  showModal('Winner 최종 확정 중...', '9대 법정/고증 QC 통과 실물 파일을 outputs/winners/에 등록하고 매니페스트를 갱신합니다.');

  try {
    const res = await fetch('/api/winner/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidate_path: STATE.selectedCandidate.path,
        scene_id: STATE.scenarioId,
        notes: `QC 9대 항목 통과 승인 (검증 항목: ${Object.keys(STATE.qcChecks).length}개)`,
        qc_checks: STATE.qcChecks
      })
    });

    const data = await res.json();
    hideModal();

    if (data.status === 'SUCCESS') {
      STATE.winnerPath = data.approval.winner_path;
      updateWinnerBadge(true, data.approval.winner_path);
      alert(`🏆 축하합니다! 씬 #${STATE.scenarioId}의 최종 승인본(Winner)이 확정되었습니다.\n경로: ${data.approval.winner_path}`);
    }
  } catch (e) {
    hideModal();
    alert('Winner 승인 실패: ' + e.message);
  }
}

function updateWinnerBadge(isApproved, path) {
  const badge = document.getElementById('winnerStatusBadge');
  if (isApproved) {
    badge.textContent = `🏆 Winner 확정 완료 (씬 #${STATE.scenarioId})`;
    badge.style.color = 'var(--accent-emerald)';
  } else {
    badge.textContent = '🏆 위너 상태: 미확정';
    badge.style.color = 'var(--accent-gold)';
  }
}

// ---------- 3D 비디오 생성 (MiniMax H3 + TTS) ----------

async function generateH3Video() {
  if (!STATE.winnerPath) {
    alert('비디오를 생성하려면 먼저 [04 Winner 승인]을 완료해야 합니다!');
    return;
  }

  const duration = parseFloat(document.getElementById('videoDurationSelect').value) || 6.0;

  showModal('3D H3 비디오 및 음성 합성 중...', `MiniMax H3 Ref2VA (${duration}초) I2V 모션 렌더링 및 Edge-TTS 한국어 음성 결합 중입니다. 잠시만 기다려주세요.`);

  try {
    const res = await fetch('/api/video/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scene_id: STATE.scenarioId,
        winner_path: STATE.winnerPath,
        duration_sec: duration,
        aspect: STATE.aspectRatio
      })
    });

    const data = await res.json();
    hideModal();

    if (data.status === 'SUCCESS' && data.video) {
      const vid = data.video;
      const player = document.getElementById('h3VideoPlayer');
      const src = document.getElementById('videoSource');

      src.src = vid.master_url + '?t=' + Date.now();
      player.load();
      player.play().catch(() => {});

      document.getElementById('videoDurationLabel').textContent = `재생시간: ${vid.duration.toFixed(1)}초`;
      setVisualMode('video');
    }
  } catch (e) {
    hideModal();
    alert('비디오 생성 중 오류: ' + e.message);
  }
}

// ---------- 공식 법정 교육일지(.xlsx) 출력 ----------

async function exportLegalReport() {
  const driverName = document.getElementById('reportDriverName').value.trim() || '김기사';
  const company = document.getElementById('reportCompany').value.trim() || '한라건설';

  showModal('교육일지 엑셀 생성 중...', '법정 서식에 맞춘 안전보건 교육일지(.xlsx)에 교육 사진 및 기사 서명란을 매핑하고 있습니다.');

  try {
    const res = await fetch('/api/report/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scene_id: STATE.scenarioId,
        driver_name: driverName,
        company: company,
        instructor: '안전보건관리책임자'
      })
    });

    const data = await res.json();
    hideModal();

    if (data.status === 'SUCCESS' && data.download_url) {
      // 엑셀 파일 즉시 브라우저 다운로드
      const a = document.createElement('a');
      a.href = data.download_url;
      a.download = `덤프트럭_안전교육일지_씬${STATE.scenarioId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } catch (e) {
    hideModal();
    alert('교육일지 출력 실패: ' + e.message);
  }
}

// ---------- 캔버스 뷰 모드 및 슬라이더 드래그 ----------

function setVisualMode(mode) {
  STATE.visualMode = mode;

  // 탭 스타일
  document.getElementById('tabGrid').className = 'mode-tab-btn' + (mode === 'grid' ? ' active' : '');
  document.getElementById('tabSlider').className = 'mode-tab-btn' + (mode === 'slider' ? ' active' : '');
  document.getElementById('tabVideo').className = 'mode-tab-btn' + (mode === 'video' ? ' active' : '');

  // 뷰포트 전환
  document.getElementById('viewGrid').className = 'viewport-view' + (mode === 'grid' ? ' active' : '');
  document.getElementById('viewSlider').className = 'viewport-view' + (mode === 'slider' ? ' active' : '');
  document.getElementById('viewVideo').className = 'viewport-view' + (mode === 'video' ? ' active' : '');
}

function setAspectRatio(ratio) {
  STATE.aspectRatio = ratio;
  document.getElementById('aspect916').className = 'aspect-btn' + (ratio === '9:16' ? ' active' : '');
  document.getElementById('aspect169').className = 'aspect-btn' + (ratio === '16:9' ? ' active' : '');

  const cls = ratio === '16:9' ? 'aspect-16-9' : 'aspect-9-16';
  const removeCls = ratio === '16:9' ? 'aspect-9-16' : 'aspect-16-9';

  ['candidateGrid', 'comparisonSlider', 'videoWrapper'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove(removeCls);
      el.classList.add(cls);
    }
  });
}

function resetCanvasView() {
  const sliderAfter = document.getElementById('sliderAfterWrapper');
  const sliderHandle = document.getElementById('sliderHandle');
  if (sliderAfter && sliderHandle) {
    sliderAfter.style.width = '50%';
    sliderHandle.style.left = '50%';
  }
}

function initSliderDrag() {
  const container = document.getElementById('comparisonSlider');
  const afterWrapper = document.getElementById('sliderAfterWrapper');
  const handle = document.getElementById('sliderHandle');

  let isDragging = false;

  const updatePosition = (clientX) => {
    const rect = container.getBoundingClientRect();
    let offsetX = clientX - rect.left;
    if (offsetX < 0) offsetX = 0;
    if (offsetX > rect.width) offsetX = rect.width;

    const percentage = (offsetX / rect.width) * 100;
    afterWrapper.style.width = `${percentage}%`;
    handle.style.left = `${percentage}%`;
  };

  container.addEventListener('mousedown', (e) => {
    isDragging = true;
    updatePosition(e.clientX);
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    updatePosition(e.clientX);
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // 터치 이벤트 대응
  container.addEventListener('touchstart', (e) => {
    isDragging = true;
    if (e.touches.length > 0) updatePosition(e.touches[0].clientX);
  });

  window.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    if (e.touches.length > 0) updatePosition(e.touches[0].clientX);
  });

  window.addEventListener('touchend', () => {
    isDragging = false;
  });
}

// ---------- 모달 다이얼로그 ----------

function showModal(title, msg) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalMessage').textContent = msg;
  document.getElementById('progressModal').classList.remove('hidden');
}

function hideModal() {
  document.getElementById('progressModal').classList.add('hidden');
}
