export function openModal(modalId) {
    document.getElementById(modalId)?.classList.remove("hidden");
}

export function closeModal(modalId) {
    document.getElementById(modalId)?.classList.add("hidden");
}
