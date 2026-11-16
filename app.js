// app.js
// ============================================================
// index.htmlから読み込んで使用する。
//
// 構成:
//   1. Pyodide（ブラウザ内Python実行環境）を起動する
//   2. orchestrator_api.py をPyodideに読み込ませ、
//      requests(HTTP)をPyodide側から呼べるようにする
//   3. API URL（cloudflaredの公開URL）はlocalStorageに保存し、
//      設定モーダルから毎回変更できるようにする
//   4. 一覧表示・新規登録・編集・削除・承認のUIロジック
//   5. 承認URL(#id=&token=&api=)で開いたとき、1件の承認要求を表示し、承認・却下する
//   6. 接続先は「API URL（公開）」と「ローカルURL」から選べる
// ============================================================

const STORAGE_KEY = "approvalApp.apiUrl";
const STORAGE_LOCAL_KEY = "approvalApp.localUrl";
const STORAGE_TARGET_KEY = "approvalApp.target"; // "remote" | "local"

// ---- DOM要素 ----
const bootBanner = document.getElementById("bootBanner");
const bootBannerText = document.getElementById("bootBannerText");

const connectionBar = document.getElementById("connectionBar");
const connectionDot = document.getElementById("connectionDot");
const connectionText = document.getElementById("connectionText");
const settingsButton = document.getElementById("settingsButton");

const settingsModal = document.getElementById("settingsModal");
const apiUrlInput = document.getElementById("apiUrlInput");
const localUrlInput = document.getElementById("localUrlInput");
const apiTargetSelect = document.getElementById("apiTargetSelect");
const settingsTestResult = document.getElementById("settingsTestResult");
const settingsCancelButton = document.getElementById("settingsCancelButton");
const settingsTestButton = document.getElementById("settingsTestButton");
const settingsSaveButton = document.getElementById("settingsSaveButton");

const approvalCard = document.getElementById("approvalCard");
const approvalId = document.getElementById("approvalId");
const approvalStatus = document.getElementById("approvalStatus");
const approvalPurpose = document.getElementById("approvalPurpose");
const approvalCommand = document.getElementById("approvalCommand");
const approvalApi = document.getElementById("approvalApi");
const approvalActions = document.getElementById("approvalActions");
const approvalApproveButton = document.getElementById("approvalApproveButton");
const approvalRejectButton = document.getElementById("approvalRejectButton");

const listArea = document.getElementById("listArea");
const newButton = document.getElementById("newButton");
const message = document.getElementById("message");

const editModal = document.getElementById("editModal");
const editModalTitle = document.getElementById("editModalTitle");
const editId = document.getElementById("editId");
const editPurpose = document.getElementById("editPurpose");
const editCommand = document.getElementById("editCommand");
const editStatus = document.getElementById("editStatus");
const editCancelButton = document.getElementById("editCancelButton");
const editSaveButton = document.getElementById("editSaveButton");

const deleteModal = document.getElementById("deleteModal");
const deleteModalText = document.getElementById("deleteModalText");
const deleteCancelButton = document.getElementById("deleteCancelButton");
const deleteConfirmButton = document.getElementById("deleteConfirmButton");

let editMode = "create"; // "create" | "edit"
let editOriginalId = "";
let deleteTargetId = "";

let pyodide = null;
let pyReady = false;
let approvalLinkOpened = false;
let approvalContext = null; // { id, token, base } 承認URLから読んだ値。メモリ上にだけ持つ


// ------------------------------------------------------------
// 承認URLで開いたときの、1件の承認要求の表示
// ------------------------------------------------------------
async function showApprovalRequest() {
    const params = new URLSearchParams(location.hash.slice(1));
    const id = params.get("id");
    const token = params.get("token");
    const api = params.get("api");
    if (!id || !token || !api) return;
    approvalLinkOpened = true;
    // トークンをアドレスバーと履歴に残さないよう、最初にフラグメントを消す
    history.replaceState(null, "", location.pathname + location.search);
    approvalContext = { id, token, base: `${api.replace(/\/+$/, "")}/api/requests/${encodeURIComponent(id)}` };
    await loadApprovalRequest();
}


async function loadApprovalRequest() {
    try {
        const response = await fetch(approvalContext.base, { headers: { "X-Approval-Token": approvalContext.token } });
        const data = await response.json();
        if (!response.ok) {
            showMessage(`承認リクエストを取得できません: ${data.status || response.status}`, "error");
            return;
        }
        approvalId.textContent = approvalContext.id;
        approvalStatus.textContent = data.status;
        approvalStatus.className = `status ${data.status === "承認済み" ? "approved" : "pending"}`;
        approvalPurpose.textContent = data.purpose;
        approvalCommand.textContent = data.command;
        approvalApi.textContent = new URL(approvalContext.base).host;
        approvalActions.classList.toggle("hidden", data.status !== "承認待ち");
        approvalCard.classList.remove("hidden");
    } catch (err) {
        showMessage(`承認リクエストを取得できません: ${err.message}`, "error");
    }
}


async function decideApproval(action) {
    approvalApproveButton.disabled = true;
    approvalRejectButton.disabled = true;
    try {
        const response = await fetch(`${approvalContext.base}/${action}`, { method: "POST", headers: { "X-Approval-Token": approvalContext.token } });
        const data = await response.json();
        if (response.ok) {
            showMessage(`${approvalContext.id} を${action === "approve" ? "承認" : "却下"}しました。`, "success");
        } else {
            showMessage(`操作できません: ${data.status || response.status}`, "error");
        }
    } catch (err) {
        showMessage(`操作に失敗しました: ${err.message}`, "error");
    }
    approvalApproveButton.disabled = false;
    approvalRejectButton.disabled = false;
    await loadApprovalRequest();
}


// ------------------------------------------------------------
// Pyodide 初期化
// ------------------------------------------------------------
async function initPyodide() {
    try {
        bootBannerText.textContent = "Python実行環境を起動しています…";
        pyodide = await loadPyodide();

        bootBannerText.textContent = "通信ライブラリを準備しています…";
        await pyodide.loadPackage(["micropip"]);

        const micropip = pyodide.pyimport("micropip");
        // pyodide-http: requests の呼び出しをブラウザfetchにブリッジするパッケージ
        await micropip.install(["requests", "pyodide-http"]);

        await pyodide.runPythonAsync(`
import pyodide_http
pyodide_http.patch_all()
        `);

        bootBannerText.textContent = "APIクライアントを読み込んでいます…";
        const apiSource = await (await fetch("./orchestrator_api.py")).text();
        await pyodide.runPythonAsync(apiSource);

        pyReady = true;
        bootBanner.classList.add("hidden");
        connectionBar.classList.remove("hidden");

        const savedUrl = getActiveUrl();
        if (savedUrl) {
            await pyodide.runPythonAsync(`set_base_url(${JSON.stringify(savedUrl)})`);
            updateConnectionStatus("pending", savedUrl);
            await checkConnectionAndLoad();
        } else {
            updateConnectionStatus("pending", "APIのURLが未設定です");
            if (!approvalLinkOpened) openSettingsModal();
        }
    } catch (err) {
        console.error(err);
        bootBannerText.textContent = "Python実行環境の起動に失敗しました。ページを再読み込みしてください。";
        bootBanner.classList.remove("hidden");
    }
}


function updateConnectionStatus(state, text) {
    connectionDot.classList.remove("ok", "ng", "pending");
    connectionDot.classList.add(state);
    connectionText.textContent = text;
}


async function callPy(pyCall) {
    // pyodide.runPythonAsync の戻り値(JSON文字列)をパースして返す共通ラッパー
    const resultStr = await pyodide.runPythonAsync(pyCall);
    return JSON.parse(resultStr);
}


// ------------------------------------------------------------
// 接続設定
// ------------------------------------------------------------
function normalizeUrl(text, defaultScheme) {
    const trimmed = text.trim().replace(/\/+$/, "");
    if (!trimmed) return "";
    return /^https?:\/\//i.test(trimmed) ? trimmed : `${defaultScheme}://${trimmed}`;
}


function getActiveUrl() {
    const isLocal = localStorage.getItem(STORAGE_TARGET_KEY) === "local";
    return localStorage.getItem(isLocal ? STORAGE_LOCAL_KEY : STORAGE_KEY) || "";
}


function getSelectedUrl() {
    if (apiTargetSelect.value === "local") return normalizeUrl(localUrlInput.value, "http");
    return normalizeUrl(apiUrlInput.value, "https");
}


function openSettingsModal() {
    apiUrlInput.value = localStorage.getItem(STORAGE_KEY) || "";
    localUrlInput.value = localStorage.getItem(STORAGE_LOCAL_KEY) || "";
    apiTargetSelect.value = localStorage.getItem(STORAGE_TARGET_KEY) === "local" ? "local" : "remote";
    settingsTestResult.textContent = "";
    settingsModal.classList.remove("hidden");
    apiUrlInput.focus();
}


function closeSettingsModal() {
    settingsModal.classList.add("hidden");
}


async function testConnection(url) {
    if (!pyReady) return;
    settingsTestResult.textContent = "接続を確認しています…";
    await pyodide.runPythonAsync(`set_base_url(${JSON.stringify(url)})`);
    const result = await callPy("check_health()");

    if (result.ok) {
        settingsTestResult.textContent = `接続に成功しました（${result.data.name || "OK"} / ${result.data.status || ""}）`;
        settingsTestResult.style.color = "#166534";
        return true;
    }

    settingsTestResult.textContent = `接続に失敗しました: ${result.data.error || "status " + result.status}`;
    settingsTestResult.style.color = "#991b1b";
    return false;
}


async function saveSettings() {
    const url = getSelectedUrl();

    if (!url) {
        settingsTestResult.textContent = "選んだ接続先のURLを入力してください。";
        settingsTestResult.style.color = "#991b1b";
        return;
    }

    localStorage.setItem(STORAGE_KEY, normalizeUrl(apiUrlInput.value, "https"));
    localStorage.setItem(STORAGE_LOCAL_KEY, normalizeUrl(localUrlInput.value, "http"));
    localStorage.setItem(STORAGE_TARGET_KEY, apiTargetSelect.value);
    await pyodide.runPythonAsync(`set_base_url(${JSON.stringify(url)})`);

    closeSettingsModal();
    await checkConnectionAndLoad();
}


async function checkConnectionAndLoad() {
    const url = getActiveUrl();
    if (!url) {
        updateConnectionStatus("pending", "APIのURLが未設定です");
        return;
    }

    updateConnectionStatus("pending", `確認中… ${url}`);
    const result = await callPy("check_health()");

    if (result.ok) {
        updateConnectionStatus("ok", `接続中: ${url}`);
        await loadRequests();
    } else {
        updateConnectionStatus("ng", `接続失敗: ${url}`);
        showMessage(`APIに接続できません: ${result.data.error || "status " + result.status}`, "error");
    }
}


// ------------------------------------------------------------
// 一覧表示
// ------------------------------------------------------------
async function loadRequests() {
    if (!pyReady || !getActiveUrl()) return;

    const result = await callPy("list_requests()");

    if (!result.ok) {
        showMessage(`一覧の取得に失敗しました: ${result.data.error || result.status}`, "error");
        return;
    }

    renderList(result.data);
}


function renderList(rows) {
    listArea.innerHTML = "";

    if (!rows || rows.length === 0) {
        listArea.innerHTML = `<p class="empty">リクエストはまだありません。</p>`;
        return;
    }

    rows.forEach(row => {
        const item = document.createElement("div");
        item.className = "item";

        const statusClass = row.status === "承認済み" ? "approved" : "pending";

        item.innerHTML = `
            <div class="item-main">
                <span class="item-id">${escapeHtml(row.id)}</span>
                <span class="status ${statusClass}">${escapeHtml(row.status)}</span>
            </div>
            <div class="item-detail">
                <div><span class="label">目的</span><span class="value">${escapeHtml(row.purpose)}</span></div>
                <div><span class="label">実行コマンド</span><span class="value command">${escapeHtml(row.command)}</span></div>
            </div>
            <div class="item-actions">
                ${row.status === "承認待ち" ? `<button class="approve-button" data-action="approve" data-id="${escapeHtml(row.id)}">承認する</button>` : ""}
                <button class="edit-button" data-action="edit" data-id="${escapeHtml(row.id)}">編集</button>
                <button class="danger-button" data-action="delete" data-id="${escapeHtml(row.id)}">削除</button>
            </div>
        `;

        listArea.appendChild(item);
    });
}


listArea.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;

    if (action === "approve") {
        await approveRequest(id);
    } else if (action === "edit") {
        await openEditModal(id);
    } else if (action === "delete") {
        openDeleteModal(id);
    }
});


async function approveRequest(id) {
    const result = await callPy(`approve_request(${JSON.stringify(id)})`);

    if (!result.ok) {
        showMessage(`承認に失敗しました: ${result.data.error || result.status}`, "error");
        return;
    }

    showMessage(`${id} を承認しました。`, "success");
    loadRequests();
}


function openNewModal() {
    editMode = "create";
    editOriginalId = "";
    editModalTitle.textContent = "新規登録";
    editId.value = "";
    editId.disabled = false;
    editPurpose.value = "";
    editCommand.value = "";
    editStatus.value = "承認待ち";
    editModal.classList.remove("hidden");
    editId.focus();
}


async function openEditModal(id) {
    const result = await callPy(`get_request(${JSON.stringify(id)})`);

    if (!result.ok) {
        showMessage(`データの取得に失敗しました: ${result.data.error || result.status}`, "error");
        return;
    }

    const data = result.data;

    editMode = "edit";
    editOriginalId = data.id;
    editModalTitle.textContent = "リクエストを編集";
    editId.value = data.id;
    editId.disabled = true;
    editPurpose.value = data.purpose;
    editCommand.value = data.command;
    editStatus.value = data.status;
    editModal.classList.remove("hidden");
    editPurpose.focus();
}


function closeEditModal() {
    editModal.classList.add("hidden");
}


async function saveEdit() {
    const purpose = editPurpose.value.trim();
    const command = editCommand.value.trim();

    if (editMode === "create") {
        const id = editId.value.trim();

        if (!id || !purpose || !command) {
            showMessage("ID・目的・実行コマンドを入力してください。", "error");
            return;
        }

        const result = await callPy(
            `create_request(${JSON.stringify(id)}, ${JSON.stringify(purpose)}, ${JSON.stringify(command)})`
        );

        if (!result.ok) {
            showMessage(result.data.error || "登録に失敗しました。", "error");
            return;
        }

        showMessage(`${id} を登録しました。`, "success");
    } else {
        if (!purpose || !command) {
            showMessage("目的・実行コマンドを入力してください。", "error");
            return;
        }

        const result = await callPy(
            `update_request(${JSON.stringify(editOriginalId)}, ${JSON.stringify(purpose)}, ${JSON.stringify(command)}, ${JSON.stringify(editStatus.value)})`
        );

        if (!result.ok) {
            showMessage(result.data.error || "更新に失敗しました。", "error");
            return;
        }

        showMessage(`${editOriginalId} を更新しました。`, "success");
    }

    closeEditModal();
    loadRequests();
}


function openDeleteModal(id) {
    deleteTargetId = id;
    deleteModalText.textContent = `${id} を削除しますか？`;
    deleteModal.classList.remove("hidden");
}


function closeDeleteModal() {
    deleteModal.classList.add("hidden");
    deleteTargetId = "";
}


async function confirmDelete() {
    const id = deleteTargetId;

    const result = await callPy(`delete_request(${JSON.stringify(id)})`);

    if (!result.ok) {
        showMessage(`削除に失敗しました: ${result.data.error || result.status}`, "error");
        closeDeleteModal();
        return;
    }

    showMessage(`${id} を削除しました。`, "success");
    closeDeleteModal();
    loadRequests();
}


function showMessage(text, type) {
    message.textContent = text;
    message.classList.remove("hidden", "success", "error");
    message.classList.add(type);
}


function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}


// ------------------------------------------------------------
// イベント登録
// ------------------------------------------------------------
newButton.addEventListener("click", openNewModal);
editCancelButton.addEventListener("click", closeEditModal);
editSaveButton.addEventListener("click", saveEdit);
deleteCancelButton.addEventListener("click", closeDeleteModal);
deleteConfirmButton.addEventListener("click", confirmDelete);

settingsButton.addEventListener("click", openSettingsModal);
settingsCancelButton.addEventListener("click", closeSettingsModal);
settingsTestButton.addEventListener("click", () => testConnection(getSelectedUrl()));
settingsSaveButton.addEventListener("click", saveSettings);
approvalApproveButton.addEventListener("click", () => decideApproval("approve"));
approvalRejectButton.addEventListener("click", () => decideApproval("reject"));

// PWA: Service Worker登録（相対パスで登録することでサブパス配信に対応）
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(err => {
        console.warn("Service Worker registration failed:", err);
    });
}

showApprovalRequest();
initPyodide();
