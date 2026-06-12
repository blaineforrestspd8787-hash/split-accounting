/**
 * app.js — 核心逻辑与 UI 渲染
 * 依赖 storage.js, calc.js, export.js, supabase.js
 */

// ===== 初始化 =====
let editingId = null;        // 当前编辑的记录 ID（首页表单用）
let modalEditId = null;     // 模态框编辑的记录 ID

document.addEventListener('DOMContentLoaded', () => {
  initStorage();

  // 检查是否已登录
  const info = getLedgerInfo();
  if (info) {
    supabaseRestoreLedger(info);
    $('#loginOverlay').classList.add('hidden'); // 隐藏登录界面
    initApp();
    refreshHomePage();  // 确保打开时数据区域已填充
    syncFromCloud(); // 后台静默同步数据
  }
  // 未登录：登录界面默认显示，等待用户输入

  initLogin();
});

// ===== 应用核心初始化（登录后调用） =====
function initApp() {
  initNavigation();
  initHomePage();
  initHistoryPage();
  initSettingsPage();
  initModal();
}

// ===== 登录 =====
function initLogin() {
  $('#btnLogin').addEventListener('click', onLogin);

  // 回车键快速登录
  $('#loginPassword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onLogin();
  });
  $('#loginName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#loginPassword').focus();
  });

  // 输入时清除错误提示
  $('#loginName').addEventListener('input', () => { $('#loginError').textContent = ''; });
  $('#loginPassword').addEventListener('input', () => { $('#loginError').textContent = ''; });
}

async function onLogin() {
  const name = $('#loginName').value.trim();
  const password = $('#loginPassword').value;
  const errorEl = $('#loginError');
  const btn = $('#btnLogin');

  if (!name || !password) {
    errorEl.textContent = '请输入账本名称和密码';
    return;
  }

  btn.disabled = true;
  btn.textContent = '登录中...';
  errorEl.textContent = '';

  try {
    const ledger = await supabaseLogin(name, password);

    // 保存登录信息到本地
    saveLedgerInfo({ id: ledger.id, name: ledger.name, settings: ledger.settings });

    // 从云端拉取数据
    const remoteRecords = await supabaseFetchRecords(ledger.id);
    if (remoteRecords.length > 0) {
      // 云端有数据 → 替换本地（云为权威，上次打开时同步过）
      saveRecords(remoteRecords);
    } else {
      // 云端为空 → 推送本地数据到云端
      const localRecords = getRecords();
      if (localRecords.length > 0) {
        await supabaseUpsertAllRecords(ledger.id, localRecords);
      }
    }

    // 同步云端设置到本地
    if (ledger.settings && typeof ledger.settings.splitPercentage === 'number') {
      const localSettings = getSettings();
      if (localSettings.splitPercentage !== ledger.settings.splitPercentage) {
        saveSettings(ledger.settings);
      }
    }

    // 隐藏登录、展示应用
    $('#loginOverlay').classList.add('hidden');
    initApp();
    refreshHomePage();  // 填充统计和最近记录
  } catch (err) {
    errorEl.textContent = err.message || '登录失败，请重试';
  } finally {
    btn.disabled = false;
    btn.textContent = '登录 / 注册';
  }
}

// ===== DOM 引用 =====
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ===== Tab 导航 =====
function initNavigation() {
  const tabs = $$('.tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      // 更新 Tab 状态
      tabs.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      // 切换视图
      $$('.view').forEach(v => v.classList.remove('active'));
      $(`#view-${tabName}`).classList.add('active');
      // 每次切换到首页时刷新数据
      if (tabName === 'home') {
        refreshHomePage();
      }
      if (tabName === 'history') {
        refreshHistoryPage();
      }
    });
  });
}

// ===== 首页 =====
function initHomePage() {
  // 日期选择器默认今天
  const dateInput = $('#recordDate');
  const today = new Date().toISOString().split('T')[0];
  dateInput.value = today;

  // 收入输入实时计算
  $('#incomeInput').addEventListener('input', onIncomeInput);
  // 日期变更
  dateInput.addEventListener('change', onDateChange);
  // 保存/更新按钮
  $('#btnSave').addEventListener('click', onSave);

  // 初始加载
  onDateChange();
}

function refreshHomePage() {
  refreshStats();
  refreshRecentList();
  // 检查当前日期是否已有记录
  onDateChange();
}

function onIncomeInput() {
  const settings = getSettings();
  const ratio = settings.splitPercentage;
  const income = parseFloat($('#incomeInput').value) || 0;

  const { profit, partnerShare } = calcSplit(income, ratio);
  $('#displayProfit').textContent = formatMoney(profit);
  $('#displayProfitPct').textContent = `(${100 - ratio}%)`;
  $('#displayShare').textContent = formatMoney(partnerShare);
  $('#displaySharePct').textContent = `(${ratio}%)`;
}

function onDateChange() {
  const date = $('#recordDate').value;
  const existing = getRecordByDate(date);
  const btn = $('#btnSave');
  const tip = $('#formTip');

  if (existing) {
    // 有记录 → 更新模式
    editingId = existing.id;
    $('#incomeInput').value = existing.totalIncome;
    btn.textContent = '更新';
    btn.classList.add('btn-secondary');
    btn.classList.remove('btn-primary');
    tip.textContent = `已存在 ${formatDateLong(date)} 的记录，修改后将覆盖`;
  } else {
    // 无记录 → 新增模式
    editingId = null;
    $('#incomeInput').value = '';
    btn.textContent = '保存';
    btn.classList.remove('btn-secondary');
    btn.classList.add('btn-primary');
    tip.textContent = '';
  }

  // 触发金额计算更新
  onIncomeInput();
}

async function onSave() {
  const date = $('#recordDate').value;
  const income = parseFloat($('#incomeInput').value);

  // 验证
  if (isNaN(income) || income < 0) {
    alert('请输入有效的金额（非负数字）');
    return;
  }

  const settings = getSettings();
  const ratio = settings.splitPercentage;
  const { profit, partnerShare } = calcSplit(income, ratio);
  const ledger = supabaseGetCurrentLedger();

  if (editingId) {
    // 更新模式
    updateRecord(editingId, income, ratio);
    showToast('更新成功！');
    // 同步到云端
    if (ledger) {
      const updated = getRecordById(editingId);
      supabaseUpsertRecord(ledger.id, updated).catch(e => console.warn('云端同步失败:', e.message));
    }
  } else {
    // 新增模式
    const existing = getRecordByDate(date);
    if (existing) {
      if (!confirm(`该日期已有记录（¥${existing.totalIncome}），是否覆盖？`)) return;
      updateRecord(existing.id, income, ratio);
      if (ledger) {
        const updated = getRecordById(existing.id);
        supabaseUpsertRecord(ledger.id, updated).catch(e => console.warn('云端同步失败:', e.message));
      }
    } else {
      const record = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        date: date,
        totalIncome: income,
        profit: profit,
        partnerShare: partnerShare,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      addRecord(record);
      if (ledger) {
        supabaseUpsertRecord(ledger.id, record).catch(e => console.warn('云端同步失败:', e.message));
      }
    }
    showToast('保存成功！');
  }

  // 刷新
  refreshHomePage();
}

function refreshStats() {
  const records = getRecords();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // 本月统计
  const monthStats = calcMonthStats(records, year, month);
  $('#monthStatsTitle').textContent = `本月统计（${month}月）`;
  $('#monthIncome').textContent = formatMoney(monthStats.totalIncome);
  $('#monthProfit').textContent = formatMoney(monthStats.totalProfit);
  $('#monthShare').textContent = formatMoney(monthStats.totalShare);

  // 今年统计
  const yearStats = calcYearStats(records, year);
  $('#yearStatsTitle').textContent = `今年统计（${year}年）`;
  $('#yearIncome').textContent = formatMoney(yearStats.totalIncome);
  $('#yearProfit').textContent = formatMoney(yearStats.totalProfit);
  $('#yearShare').textContent = formatMoney(yearStats.totalShare);
}

function refreshRecentList() {
  const records = getRecords();
  const recent = getRecentRecords(records, 7);
  const container = $('#recentList');

  if (recent.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无记录，开始记账吧！</div>';
    return;
  }

  container.innerHTML = recent.map(r => `
    <div class="recent-item">
      <span class="recent-date">${formatDateShort(r.date)}</span>
      <span class="recent-income">${formatMoney(r.totalIncome)}</span>
      <span class="recent-profit">${formatMoney(r.profit)}</span>
      <span class="recent-share">${formatMoney(r.partnerShare)}</span>
      <button class="btn-edit-sm" data-date="${r.date}" data-income="${r.totalIncome}">编辑</button>
    </div>
  `).join('');

  // 绑定最近记录的编辑按钮
  container.querySelectorAll('.btn-edit-sm').forEach(btn => {
    btn.addEventListener('click', () => {
      const date = btn.dataset.date;
      $('#recordDate').value = date;
      // 触发日期变更
      const evt = new Event('change');
      $('#recordDate').dispatchEvent(evt);
      // 填入金额
      $('#incomeInput').value = btn.dataset.income;
      onIncomeInput();
      // 切换到首页 Tab
      $$('.tab-btn').forEach(t => t.classList.remove('active'));
      document.querySelector('[data-tab="home"]').classList.add('active');
      $$('.view').forEach(v => v.classList.remove('active'));
      $('#view-home').classList.add('active');
    });
  });
}

// ===== 历史记录页 =====
function initHistoryPage() {
  // 初始化年月下拉
  const now = new Date();
  const yearSelect = $('#historyYear');
  const monthSelect = $('#historyMonth');
  const currentYear = now.getFullYear();

  // 年份：当前年~当前年-5
  for (let y = currentYear; y >= currentYear - 5; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = `${y}`;
    yearSelect.appendChild(opt);
  }
  yearSelect.value = currentYear;

  // 月份：1~12
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = `${m}`;
    monthSelect.appendChild(opt);
  }
  monthSelect.value = now.getMonth() + 1;

  // 变更事件
  yearSelect.addEventListener('change', refreshHistoryPage);
  monthSelect.addEventListener('change', refreshHistoryPage);

  // 导出按钮
  $('#btnExport').addEventListener('click', () => {
    const year = parseInt(yearSelect.value);
    const month = parseInt(monthSelect.value);
    const records = getFilteredRecords(year, month);
    exportCSV(records, year, month);
  });
}

function refreshHistoryPage() {
  const year = parseInt($('#historyYear').value);
  const month = parseInt($('#historyMonth').value);
  const records = getFilteredRecords(year, month);
  renderHistoryTable(records, year, month);
}

function getFilteredRecords(year, month) {
  const all = getRecords();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return all.filter(r => r.date.startsWith(prefix))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function renderHistoryTable(records, year, month) {
  const tbody = $('#historyBody');

  if (records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">暂无记录</td></tr>';
    $('#historySummary').textContent = '';
    return;
  }

  tbody.innerHTML = records.map(r => `
    <tr>
      <td>${formatDateLong(r.date)}</td>
      <td class="money">${formatMoney(r.totalIncome)}</td>
      <td class="money profit-text">${formatMoney(r.profit)}</td>
      <td class="money share-text">${formatMoney(r.partnerShare)}</td>
      <td>
        <div class="action-btns">
          <button class="btn-icon" data-action="edit" data-id="${r.id}">编辑</button>
          <button class="btn-icon danger" data-action="delete" data-id="${r.id}">删除</button>
        </div>
      </td>
    </tr>
  `).join('');

  // 绑定操作按钮
  tbody.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id));
  });
  tbody.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteRecordById(btn.dataset.id, year, month));
  });

  // 合计行
  const totalIncome = records.reduce((s, r) => s + r.totalIncome, 0);
  const totalProfit = records.reduce((s, r) => s + r.profit, 0);
  const totalShare = records.reduce((s, r) => s + r.partnerShare, 0);
  $('#historySummary').textContent =
    `共 ${records.length} 条记录 | 合计：总收入 ${formatMoney(totalIncome)}，利润 ${formatMoney(totalProfit)}，分成 ${formatMoney(totalShare)}`;
}

async function deleteRecordById(id, year, month) {
  const record = getRecordById(id);
  if (!record) return;
  if (!confirm(`确定删除 ${formatDateLong(record.date)} 的记录（收入 ¥${record.totalIncome}）吗？`)) return;

  deleteRecord(id);

  // 同步到云端
  const ledger = supabaseGetCurrentLedger();
  if (ledger) {
    supabaseDeleteRecord(ledger.id, id).catch(e => console.warn('云端删除失败:', e.message));
  }

  refreshHistoryPage();
  // 如果首页可见也刷新
  if ($('#view-home').classList.contains('active')) {
    refreshHomePage();
  } else {
    // 同时更新统计提示
    refreshStats();
  }
}

// ===== 编辑模态框 =====
function initModal() {
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalCancel').addEventListener('click', closeModal);
  $('#modalSave').addEventListener('click', onModalSave);
  $('#modalIncomeInput').addEventListener('input', onModalPreview);

  // 点击遮罩关闭
  $('#editModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // ESC 关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

function openEditModal(id) {
  const record = getRecordById(id);
  if (!record) return;

  modalEditId = id;
  $('#modalDateLabel').textContent = formatDateLong(record.date);
  $('#modalIncomeInput').value = record.totalIncome;
  onModalPreview();
  $('#editModal').classList.remove('hidden');
}

function closeModal() {
  modalEditId = null;
  $('#editModal').classList.add('hidden');
}

function onModalPreview() {
  const income = parseFloat($('#modalIncomeInput').value) || 0;
  const settings = getSettings();
  const ratio = settings.splitPercentage;
  const { profit, partnerShare } = calcSplit(income, ratio);

  $('#modalPreview').innerHTML = `
    <div class="preview-row">
      <span>总收入</span>
      <span>${formatMoney(income)}</span>
    </div>
    <div class="preview-row">
      <span>利润（${100 - ratio}%）</span>
      <span style="color:var(--profit-color)">${formatMoney(profit)}</span>
    </div>
    <div class="preview-row">
      <span>分成（${ratio}%）</span>
      <span style="color:var(--share-color)">${formatMoney(partnerShare)}</span>
    </div>
  `;
}

async function onModalSave() {
  const income = parseFloat($('#modalIncomeInput').value);
  if (isNaN(income) || income < 0) {
    alert('请输入有效的金额');
    return;
  }
  if (!modalEditId) return;

  const settings = getSettings();
  updateRecord(modalEditId, income, settings.splitPercentage);

  // 同步到云端
  const ledger = supabaseGetCurrentLedger();
  if (ledger) {
    const updated = getRecordById(modalEditId);
    supabaseUpsertRecord(ledger.id, updated).catch(e => console.warn('云端同步失败:', e.message));
  }

  closeModal();
  refreshHistoryPage();
  showToast('已更新');
}

// ===== 设置页 =====
function initSettingsPage() {
  const settings = getSettings();
  const ratioInput = $('#splitRatioInput');
  const ratioSlider = $('#splitRatioSlider');

  ratioInput.value = settings.splitPercentage;
  ratioSlider.value = settings.splitPercentage;
  updateRatioTip(settings.splitPercentage);

  // 输入框 ↔ 滑块同步
  ratioInput.addEventListener('input', () => {
    let val = parseInt(ratioInput.value) || 0;
    val = Math.max(0, Math.min(100, val));
    ratioSlider.value = val;
    updateRatioTip(val);
  });

  ratioSlider.addEventListener('input', () => {
    const val = parseInt(ratioSlider.value);
    ratioInput.value = val;
    updateRatioTip(val);
  });

  // 保存
  $('#btnSaveSettings').addEventListener('click', async () => {
    const val = parseInt(ratioInput.value);
    if (isNaN(val) || val < 0 || val > 100) {
      alert('比例必须在 0~100 之间');
      return;
    }

    const oldSettings = getSettings();
    const newRatio = Math.round(val);
    saveSettings({ splitPercentage: newRatio });

    // 如果比例变化，重新计算所有记录
    if (oldSettings.splitPercentage !== newRatio) {
      recalcAllRecords(newRatio);
    }

    // 同步到云端
    const ledger = supabaseGetCurrentLedger();
    if (ledger) {
      try {
        await supabaseUpdateSettings(ledger.id, { splitPercentage: newRatio });
        // 更新本地缓存的 ledger 设置
        const info = getLedgerInfo();
        if (info) {
          info.settings = { splitPercentage: newRatio };
          saveLedgerInfo(info);
        }
      } catch (e) {
        console.warn('设置同步失败:', e.message);
      }
    }

    updateRatioTip(newRatio);
    showToast('设置已保存，所有记录已重新计算');
  });

  // 导出备份
  $('#btnExportBackup').addEventListener('click', () => {
    const records = getRecords();
    const settings = getSettings();
    if (records.length === 0) {
      alert('暂无数据可导出');
      return;
    }
    exportBackup(records, settings);
    showToast('备份已导出');
  });

  // 导入恢复 — 触发文件选择
  $('#btnImportBackup').addEventListener('click', () => {
    $('#importFileInput').click();
  });

  // 选择文件后读取并导入
  $('#importFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const backup = JSON.parse(evt.target.result);
        const result = importMergeRecords(backup);
        const msg = `导入完成！新增 ${result.added} 条，更新 ${result.updated} 条` +
          (result.settingsUpdated ? '，设置已同步' : '');
        showToast(msg);
        // 刷新所有页面
        refreshHomePage();
        refreshStats();
        // 重新初始化设置页的显示值
        const newSettings = getSettings();
        $('#splitRatioInput').value = newSettings.splitPercentage;
        $('#splitRatioSlider').value = newSettings.splitPercentage;
        updateRatioTip(newSettings.splitPercentage);
      } catch (err) {
        alert('导入失败：备份文件格式不正确\n' + err.message);
      }
    };
    reader.readAsText(file);
    // 重置 file input，允许重复选择同一文件
    e.target.value = '';
  });

  // ===== 退出登录 =====
  const logoutSection = document.querySelector('#view-settings .card:last-child');
  if (logoutSection && !logoutSection.querySelector('.logout-btn')) {
    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'btn btn-secondary logout-btn';
    logoutBtn.textContent = '🚪 退出登录';
    logoutBtn.style.marginTop = '14px';
    logoutBtn.addEventListener('click', () => {
      if (confirm('确定退出登录吗？\n数据不会丢失，下次使用同一账本名+密码即可恢复。')) {
        clearLedgerInfo();
        supabaseClearLedger();
        location.reload();
      }
    });
    logoutSection.querySelector('.about-text').after(logoutBtn);
  }
}

function updateRatioTip(val) {
  const profitPct = 100 - val;
  $('#ratioTip').innerHTML =
    `即合伙人获得收入的 <strong>${val}%</strong>，你到手 <strong>${profitPct}%</strong>`;
}

// ===== 云端同步 =====

/**
 * 后台同步：从云端拉取最新数据，与本地按 updatedAt 合并（较新者胜出）
 * 同时将本地更新的记录推送到云端
 */
async function syncFromCloud() {
  const ledger = supabaseGetCurrentLedger();
  if (!ledger) return;

  try {
    const remoteRecords = await supabaseFetchRecords(ledger.id);
    if (remoteRecords.length === 0) return; // 云端无数据

    const localRecords = getRecords();

    // 按 ID 建立本地索引
    const localMap = {};
    localRecords.forEach(r => { localMap[r.id] = r; });

    let changed = false;

    // 合并云端记录到本地
    remoteRecords.forEach(rr => {
      const existing = localMap[rr.id];
      if (!existing) {
        // 云端有、本地无 → 新增
        localRecords.push(rr);
        changed = true;
      } else if (new Date(rr.updatedAt) > new Date(existing.updatedAt)) {
        // 云端比本地新 → 覆盖
        Object.assign(existing, rr);
        changed = true;
      }
      // 本地比云端新：暂不处理，下面会推送
    });

    if (changed) {
      saveRecords(localRecords);
      // 刷新当前可见视图
      const activeView = document.querySelector('.view.active');
      if (activeView) {
        if (activeView.id === 'view-home') refreshHomePage();
        else if (activeView.id === 'view-history') refreshHistoryPage();
      }
      refreshStats();
    }

    // 将本地较新或云端没有的记录推送到云端
    const remoteIds = new Set(remoteRecords.map(r => r.id));
    const toSync = localRecords.filter(r => {
      if (!remoteIds.has(r.id)) return true; // 云端没有
      const remote = remoteRecords.find(rr => rr.id === r.id);
      return remote && new Date(r.updatedAt) > new Date(remote.updatedAt); // 本地更新
    });

    if (toSync.length > 0) {
      await supabaseUpsertAllRecords(ledger.id, toSync);
    }

    // 同步云端设置到本地
    const cloudLedger = await supabaseFetchLedger(ledger.id);
    if (cloudLedger && cloudLedger.settings && typeof cloudLedger.settings.splitPercentage === 'number') {
      const localSettings = getSettings();
      if (localSettings.splitPercentage !== cloudLedger.settings.splitPercentage) {
        saveSettings(cloudLedger.settings);
        // 更新设置页的显示
        const ri = $('#splitRatioInput');
        const rs = $('#splitRatioSlider');
        if (ri && rs) {
          ri.value = cloudLedger.settings.splitPercentage;
          rs.value = cloudLedger.settings.splitPercentage;
          updateRatioTip(cloudLedger.settings.splitPercentage);
        }
      }
    }
  } catch (e) {
    // 静默处理后台同步错误
    console.warn('后台同步未完成:', e.message);
  }
}

/**
 * 刷新所有视图
 */
function refreshAll() {
  refreshHomePage();
  refreshHistoryPage();
  const settings = getSettings();
  const ri = $('#splitRatioInput');
  const rs = $('#splitRatioSlider');
  if (ri && rs) {
    ri.value = settings.splitPercentage;
    rs.value = settings.splitPercentage;
    updateRatioTip(settings.splitPercentage);
  }
}

// ===== Toast 提示 =====
function showToast(msg) {
  // 移除已有 toast
  const old = $('.toast');
  if (old) old.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);

  // 触发动画
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// ===== 动态注入 Toast 样式 =====
(function injectToastStyle() {
  const style = document.createElement('style');
  style.textContent = `
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: #1F2937;
      color: white;
      padding: 10px 24px;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 999;
      opacity: 0;
      transition: all 0.3s ease;
      pointer-events: none;
      white-space: nowrap;
    }
    .toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  `;
  document.head.appendChild(style);
})();
