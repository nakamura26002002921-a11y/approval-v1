# app.js
# ============================================================
# Usage:
#   index.htmlから読み込んで使用する
# ============================================================

let currentServerId = "";

const serverIdInput = document.getElementById("serverId");
const accessButton = document.getElementById("accessButton");
const serverPanel = document.getElementById("serverPanel");
const currentServerIdElement = document.getElementById("currentServerId");
const serverStatus = document.getElementById("serverStatus");
const approveButton = document.getElementById("approveButton");
const message = document.getElementById("message");
const approvalModal = document.getElementById("approvalModal");
const approvalServerId = document.getElementById("approvalServerId");
const cancelButton = document.getElementById("cancelButton");
const confirmButton = document.getElementById("confirmButton");


async function accessServer() {
    const serverId = serverIdInput.value.trim();

    if (!serverId) {
        showMessage("サーバーIDを入力してください。", "error");
        return;
    }

    const response = await fetch(`/api/request/${encodeURIComponent(serverId)}`);
    const data = await response.json();

    currentServerId = serverId;
    currentServerIdElement.textContent = data.id;
    updateStatus(data.status);
    serverPanel.classList.remove("hidden");
    showMessage(`サーバー ${serverId} にアクセスしました。`, "success");
}


function openApprovalModal() {
    approvalServerId.value = currentServerId;
    approvalModal.classList.remove("hidden");
    approvalServerId.focus();
}


function closeApprovalModal() {
    approvalModal.classList.add("hidden");
    approvalServerId.value = "";
}


async function approveServer() {
    const serverId = approvalServerId.value.trim();

    if (!serverId) {
        showMessage("承認するサーバーIDを入力してください。", "error");
        return;
    }

    const response = await fetch("/api/request/approve", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            id: serverId
        })
    });

    const data = await response.json();

    currentServerId = serverId;
    serverIdInput.value = serverId;
    currentServerIdElement.textContent = data.id;
    updateStatus(data.status);

    closeApprovalModal();
    serverPanel.classList.remove("hidden");
    showMessage(`サーバー ${serverId} を承認しました。`, "success");
}


function updateStatus(status) {
    serverStatus.textContent = status;
    serverStatus.classList.remove("pending");
    serverStatus.classList.remove("approved");

    if (status === "承認待ち") {
        serverStatus.classList.add("pending");
    }

    if (status === "承認済み") {
        serverStatus.classList.add("approved");
    }
}


function showMessage(text, type) {
    message.textContent = text;
    message.classList.remove("hidden");
    message.classList.remove("success");
    message.classList.remove("error");
    message.classList.add(type);
}


accessButton.addEventListener("click", accessServer);
approveButton.addEventListener("click", openApprovalModal);
cancelButton.addEventListener("click", closeApprovalModal);
confirmButton.addEventListener("click", approveServer);

serverIdInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        accessServer();
    }
});

approvalServerId.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        approveServer();
    }
});

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js");
}
