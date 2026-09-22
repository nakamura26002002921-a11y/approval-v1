// app.js
// ============================================================
// Usage:
//   index.htmlから読み込んで使用する
// ============================================================

const API_BASE = "/api/requests";

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


async function loadRequests() {
    const response = await fetch(API_BASE);

    if (!response.ok) {
        showMessage("一覧の取得に失敗しました。", "error");
        return;
    }

    const rows = await response.json();
    renderList(rows);
}


function renderList(rows) {
    listArea.innerHTML = "";

    if (rows.length === 0) {
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
    const response = await fetch(`${API_BASE}/${encodeURIComponent(id)}/approve`, {
        method: "POST"
    });

    if (!response.ok) {
        showMessage("承認に失敗しました。", "error");
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
    const response = await fetch(`${API_BASE}/${encodeURIComponent(id)}`);

    if (!response.ok) {
        showMessage("データの取得に失敗しました。", "error");
        return;
    }

    const data = await response.json();

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

        const response = await fetch(API_BASE, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, purpose, command })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            showMessage(err.error || "登録に失敗しました。", "error");
            return;
        }

        showMessage(`${id} を登録しました。`, "success");
    } else {
        if (!purpose || !command) {
            showMessage("目的・実行コマンドを入力してください。", "error");
            return;
        }

        const response = await fetch(`${API_BASE}/${encodeURIComponent(editOriginalId)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                purpose,
                command,
                status: editStatus.value
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            showMessage(err.error || "更新に失敗しました。", "error");
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

    const response = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
        method: "DELETE"
    });

    if (!response.ok) {
        showMessage("削除に失敗しました。", "error");
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


newButton.addEventListener("click", openNewModal);
editCancelButton.addEventListener("click", closeEditModal);
editSaveButton.addEventListener("click", saveEdit);
deleteCancelButton.addEventListener("click", closeDeleteModal);
deleteConfirmButton.addEventListener("click", confirmDelete);

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js");
}

loadRequests();
