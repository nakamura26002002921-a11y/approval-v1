// app.js
// ============================================================
// 承認サーバー(recovery_server.py)の承認画面。
//
// 構成:
//   1. 承認URL(#id=&token=&api=)で開いたとき、1件の承認要求を表示し、承認・却下する
//   2. 「API設定」で接続先(公開URL / ローカルURL)を保存し、接続テストをする
//
// 通信はブラウザ標準の fetch だけで行う(Pyodide は使わない)。
// ============================================================

const STORAGE_KEY = "approvalApp.apiUrl";
const STORAGE_LOCAL_KEY = "approvalApp.localUrl";
const STORAGE_TARGET_KEY = "approvalApp.target"; // "remote" | "local"

// ---- DOM要素 ----
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
const idleCard = document.getElementById("idleCard");
const approvalId = document.getElementById("approvalId");
const approvalStatus = document.getElementById("approvalStatus");
const approvalPurpose = document.getElementById("approvalPurpose");
const approvalCommand = document.getElementById("approvalCommand");
const approvalApi = document.getElementById("approvalApi");
const approvalActions = document.getElementById("approvalActions");
const approvalApproveButton = document.getElementById("approvalApproveButton");
const approvalRejectButton = document.getElementById("approvalRejectButton");

const message = document.getElementById("message");

let approvalLinkOpened = false;
let approvalContext = null; // { id, token, base } 承認URLから読んだ値。メモリ上にだけ持つ


// ------------------------------------------------------------
// localStorage (プライベートモードなどで例外になっても動くようにする)
// ------------------------------------------------------------
function storageGet(key) {
    try {
        return localStorage.getItem(key) || "";
    } catch (err) {
        return "";
    }
}


function storageSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (err) {
        console.warn("localStorage に保存できません:", err);
    }
}


// ------------------------------------------------------------
// 通信 (fetch)
// ------------------------------------------------------------
function describeNetworkError(err, url) {
    if (err && err.name === "AbortError") {
        return "タイムアウトしました。サーバーが起動しているか確認してください。";
    }
    const hints = [
        "サーバーが起動しているか",
        `サーバーの CORS 設定(APPROVAL_URL / CORS_ORIGINS)がこのページのオリジン(${location.origin})を許可しているか`
    ];
    if (location.protocol === "https:" && /^http:\/\//i.test(url)) {
        hints.push("HTTPSのページから http:// への接続はブラウザにブロックされることがあります(ローカルネットワークへのアクセス許可の確認や、ページをローカルで配信する方法があります)");
    }
    return `接続できませんでした。確認してください: ${hints.join(" / ")}`;
}


// 戻り値: { reached, ok, status, data, error }
//   reached: サーバーから HTTP 応答が返ってきたか(CORS を通った証拠にもなる)
async function request(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        let data = null;
        try {
            data = await response.json();
        } catch (err) {
            data = null;
        }
        return { reached: true, ok: response.ok, status: response.status, data, error: "" };
    } catch (err) {
        return { reached: false, ok: false, status: 0, data: null, error: describeNetworkError(err, url) };
    } finally {
        clearTimeout(timer);
    }
}


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
    // すでに別の承認要求や、エラーを表示していても、新しいURLの内容に置き換える
    approvalCard.classList.add("hidden");
    message.classList.add("hidden");
    // トークンをアドレスバーと履歴に残さないよう、最初にフラグメントを消す
    history.replaceState(null, "", location.pathname + location.search);
    approvalContext = { id, token, base: `${api.replace(/\/+$/, "")}/api/requests/${encodeURIComponent(id)}` };
    idleCard.classList.add("hidden");
    updateConnectionStatus("pending", `確認中… ${new URL(approvalContext.base).host}`);
    await loadApprovalRequest();
}


async function loadApprovalRequest() {
    const host = new URL(approvalContext.base).host;
    const result = await request(approvalContext.base, { headers: { "X-Approval-Token": approvalContext.token } });

    if (!result.reached) {
        updateConnectionStatus("ng", `接続失敗: ${host}`);
        showMessage(`承認リクエストを取得できません: ${result.error}`, "error");
        return;
    }
    if (!result.ok) {
        updateConnectionStatus("ok", `接続中: ${host}`);
        const reason = (result.data && result.data.status) || result.status;
        showMessage(`承認リクエストを取得できません: ${reason}`, "error");
        return;
    }

    const data = result.data || {};
    updateConnectionStatus("ok", `接続中: ${host}`);
    approvalId.textContent = approvalContext.id;
    approvalStatus.textContent = data.status;
    approvalStatus.className = `status ${data.status === "承認済み" ? "approved" : "pending"}`;
    approvalPurpose.textContent = data.purpose;
    approvalCommand.textContent = data.command;
    approvalApi.textContent = host;
    approvalActions.classList.toggle("hidden", data.status !== "承認待ち");
    approvalCard.classList.remove("hidden");
}


async function decideApproval(action) {
    approvalApproveButton.disabled = true;
    approvalRejectButton.disabled = true;

    const result = await request(`${approvalContext.base}/${action}`, {
        method: "POST",
        headers: { "X-Approval-Token": approvalContext.token }
    });

    if (!result.reached) {
        showMessage(`操作に失敗しました: ${result.error}`, "error");
    } else if (result.ok) {
        showMessage(`${approvalContext.id} を${action === "approve" ? "承認" : "却下"}しました。`, "success");
    } else {
        const reason = (result.data && result.data.status) || result.status;
        showMessage(`操作できません: ${reason}`, "error");
    }

    approvalApproveButton.disabled = false;
    approvalRejectButton.disabled = false;
    await loadApprovalRequest();
}


// ------------------------------------------------------------
// 接続設定
// ------------------------------------------------------------
function updateConnectionStatus(state, text) {
    connectionDot.classList.remove("ok", "ng", "pending");
    connectionDot.classList.add(state);
    connectionText.textContent = text;
}


function normalizeUrl(text, defaultScheme) {
    const trimmed = text.trim().replace(/\/+$/, "");
    if (!trimmed) return "";
    return /^https?:\/\//i.test(trimmed) ? trimmed : `${defaultScheme}://${trimmed}`;
}


function getActiveUrl() {
    const isLocal = storageGet(STORAGE_TARGET_KEY) === "local";
    return storageGet(isLocal ? STORAGE_LOCAL_KEY : STORAGE_KEY);
}


function getSelectedUrl() {
    if (apiTargetSelect.value === "local") return normalizeUrl(localUrlInput.value, "http");
    return normalizeUrl(apiUrlInput.value, "https");
}


function openSettingsModal() {
    apiUrlInput.value = storageGet(STORAGE_KEY);
    localUrlInput.value = storageGet(STORAGE_LOCAL_KEY);
    apiTargetSelect.value = storageGet(STORAGE_TARGET_KEY) === "local" ? "local" : "remote";
    settingsTestResult.textContent = "";
    settingsModal.classList.remove("hidden");
    apiUrlInput.focus();
}


function closeSettingsModal() {
    settingsModal.classList.add("hidden");
}


// サーバーの疎通を確認する。
// "/" は応答が返りさえすれば(404 でも)到達と CORS の確認になる。
async function checkServer(url) {
    const result = await request(`${url}/`);

    if (!result.reached) {
        return { ok: false, text: result.error };
    }
    if (result.ok) {
        const name = (result.data && result.data.name) || "OK";
        const status = (result.data && result.data.status) || "";
        return { ok: true, text: `接続に成功しました(${name} ${status})`.trim() };
    }
    return { ok: true, text: `接続に成功しました(サーバーは応答しましたが、"/" は status ${result.status} でした)` };
}


async function testConnection(url) {
    if (!url) {
        settingsTestResult.textContent = "選んだ接続先のURLを入力してください。";
        settingsTestResult.style.color = "#991b1b";
        return false;
    }
    settingsTestResult.style.color = "";
    settingsTestResult.textContent = "接続を確認しています…";

    const result = await checkServer(url);
    settingsTestResult.textContent = result.text;
    settingsTestResult.style.color = result.ok ? "#166534" : "#991b1b";
    return result.ok;
}


async function saveSettings() {
    const url = getSelectedUrl();

    if (!url) {
        settingsTestResult.textContent = "選んだ接続先のURLを入力してください。";
        settingsTestResult.style.color = "#991b1b";
        return;
    }

    storageSet(STORAGE_KEY, normalizeUrl(apiUrlInput.value, "https"));
    storageSet(STORAGE_LOCAL_KEY, normalizeUrl(localUrlInput.value, "http"));
    storageSet(STORAGE_TARGET_KEY, apiTargetSelect.value);

    closeSettingsModal();
    await checkConnection();
}


async function checkConnection() {
    const url = getActiveUrl();
    if (!url) {
        updateConnectionStatus("pending", "APIのURLが未設定です");
        return;
    }

    updateConnectionStatus("pending", `確認中… ${url}`);
    const result = await checkServer(url);

    if (result.ok) {
        updateConnectionStatus("ok", `接続中: ${url}`);
        message.classList.add("hidden");
    } else {
        updateConnectionStatus("ng", `接続失敗: ${url}`);
        showMessage(result.text, "error");
    }
}


function showMessage(text, type) {
    message.textContent = text;
    message.classList.remove("hidden", "success", "error");
    message.classList.add(type);
}


// ------------------------------------------------------------
// イベント登録・起動
// ------------------------------------------------------------
settingsButton.addEventListener("click", openSettingsModal);
settingsCancelButton.addEventListener("click", closeSettingsModal);
settingsTestButton.addEventListener("click", () => testConnection(getSelectedUrl()));
settingsSaveButton.addEventListener("click", saveSettings);
approvalApproveButton.addEventListener("click", () => decideApproval("approve"));
approvalRejectButton.addEventListener("click", () => decideApproval("reject"));

// 開いたままのタブに、別の承認URLを貼ったとき(URLの # 以降だけが変わるとページは再読み込みされない)
window.addEventListener("hashchange", () => {
    showApprovalRequest();
});

// PWA: Service Worker登録（相対パスで登録することでサブパス配信に対応）
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(err => {
        console.warn("Service Worker registration failed:", err);
    });
}

async function start() {
    await showApprovalRequest();
    // 承認URLで開いた場合は、そのURLの接続先で状態を表示済みなので、保存済みURLの確認はしない
    if (approvalLinkOpened) return;

    if (getActiveUrl()) {
        await checkConnection();
    } else {
        updateConnectionStatus("pending", "APIのURLが未設定です");
        openSettingsModal();
    }
}

start();
