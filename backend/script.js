console.log("ZELL SCRIPT CONNECTED");

/* ------------------------------
   API BASE
   غيّر القيمة دي لما ترفع الموقع على سيرفر حقيقي
------------------------------ */
const ZELL_API = "http://localhost:3000";

/* ------------------------------
   CURRENT USER HELPERS
------------------------------ */
function getSavedUser() {
    try {
        return JSON.parse(localStorage.getItem("zellUser")) || null;
    } catch (error) {
        return null;
    }
}

function saveUser(user) {
    localStorage.setItem("zellUser", JSON.stringify(user));
}

function getSessionToken() {
    return localStorage.getItem("zellSessionToken") || "";
}

function authHeaders(extra) {
    const headers = Object.assign({ "Content-Type": "application/json" }, extra || {});
    const token = getSessionToken();

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    return headers;
}

// بترجع true لو النهاردة عيد ميلاد المستخدم (YYYY-MM-DD)
function isBirthdayToday(birthdate) {
    if (!birthdate) return false;

    const parts = String(birthdate).trim().split("-");
    if (parts.length !== 3) return false;

    const today = new Date();
    const todayMMDD = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    return `${parts[1]}-${parts[2]}` === todayMMDD;
}

/* ------------------------------
   SAFE LOCAL STORAGE READER
------------------------------ */
function getStorageArray(key) {
    try {
        return JSON.parse(localStorage.getItem(key)) || [];
    } catch (error) {
        console.error(`Storage error for ${key}:`, error);
        return [];
    }
}

/* ------------------------------
   EVIDENCE SYSTEM
------------------------------ */
function saveEvidence(number) {
    const evidence = getStorageArray("zellEvidence");

    if (!evidence.includes(number)) {
        evidence.push(number);
        localStorage.setItem("zellEvidence", JSON.stringify(evidence));
    }

    updateEvidenceCount();
}

function updateEvidenceCount() {
    const countElement = document.getElementById("evidence-count");

    if (!countElement) return;

    const evidence = getStorageArray("zellEvidence");

    countElement.textContent = String(evidence.length).padStart(2, "0");
}

/* ------------------------------
   AUTHENTICATION & ACCOUNTS
------------------------------ */
function updateAccountLinks() {
    const signInLink = document.getElementById("signInLink");
    const accountLink = document.getElementById("accountLink");
    const sideSignInLink = document.getElementById("sideSignInLink");
    const sideAccountLink = document.getElementById("sideAccountLink");
    const sideLogoutBtn = document.getElementById("sideLogoutBtn");

    const savedUser = localStorage.getItem("zellUser");

    if (signInLink) signInLink.hidden = Boolean(savedUser);
    if (accountLink) accountLink.hidden = !savedUser;
    if (sideSignInLink) sideSignInLink.hidden = Boolean(savedUser);
    if (sideAccountLink) sideAccountLink.hidden = !savedUser;
    if (sideLogoutBtn) sideLogoutBtn.hidden = !savedUser;
}

async function loginUser(event) {
    event.preventDefault();

    const form = event.target;

    const emailInput = form.querySelector('input[type="email"]');
    const passwordInput = form.querySelector('input[type="password"]');

    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";

    const message = document.getElementById("login-message");
    const submitBtn = form.querySelector('button[type="submit"]');

    try {
        const response = await fetch(`${ZELL_API}/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email,
                password
            })
        });

        const data = await response.json();

        if (!response.ok) {
            if (message) {
                message.style.color = "#ff4d4d";
                message.textContent =
                    data.message || "LOGIN FAILED.";
            }

            return;
        }

        localStorage.setItem(
            "zellSessionToken",
            data.sessionToken
        );

        localStorage.setItem(
            "zellUser",
            JSON.stringify(data.user)
        );

        if (message) {
            message.style.color = "#4dff88";
            message.textContent =
                `WELCOME BACK, ${data.user.name}`;
        }

        updateAccountLinks();

        if (submitBtn) {
            submitBtn.disabled = true;
        }

        window.location.href = "test.html";

    } catch (error) {
        if (message) {
            message.style.color = "#ff4d4d";
            message.textContent =
                "SERVER CONNECTION FAILED.";
        }

        console.error("Login error:", error);
    }
}

async function registerUser(event) {
    event.preventDefault();

    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');

    const nameInput = form.querySelector('input[type="text"]');
    const emailInput = form.querySelector('input[type="email"]');
    const passwordInput = form.querySelector('input[type="password"]');
    const birthdateInput = document.getElementById('registerBirthdate');

    const name = nameInput ? nameInput.value.trim() : "";
    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";
    const birthdate = birthdateInput ? birthdateInput.value : "";

    const message = document.getElementById("register-message");

    try {
        const response = await fetch(`${ZELL_API}/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name,
                email,
                password,
                birthdate
            })
        });

        const data = await response.json();

        if (!response.ok) {
            if (message) {
                message.style.color = "#ff4d4d";
                message.textContent =
                    data.message || "REGISTRATION FAILED.";
            }

            return;
        }

        if (message) {
            message.style.color = "#4dff88";
            message.textContent =
                "ACCOUNT CREATED SUCCESSFULLY.";
        }

        if (submitBtn) {
            submitBtn.disabled = true;
        }

        window.location.href = "login.html";

    } catch (error) {
        if (message) {
            message.style.color = "#ff4d4d";
            message.textContent =
                "SERVER CONNECTION FAILED.";
        }

        console.error("Register error:", error);
    }
}

function logoutUser() {
    localStorage.removeItem("zellUser");
    localStorage.removeItem("zellSessionToken");

    window.location.replace("test.html");
}

function setupAccountPage() {
    if (!window.location.pathname.includes("account.html")) {
        return;
    }

    const welcomeMessage = document.getElementById("welcomeMessage");
    const userEmail = document.getElementById("userEmail");

    if (!welcomeMessage || !userEmail) {
        return;
    }

    const user = getSavedUser();

    if (!user) {
        window.location.replace("login.html");
        return;
    }

    welcomeMessage.textContent = user.name || "USER";
    userEmail.textContent = user.email || "";

    fillProfileForm(user);
    setupProfileForm();
    refreshAccountFromServer();
}

// بنجيب أحدث بيانات من السيرفر عشان تاريخ الميلاد يبقى مضبوط
async function refreshAccountFromServer() {
    if (!getSessionToken()) return;

    try {
        const response = await fetch(`${ZELL_API}/me`, { headers: authHeaders() });

        if (!response.ok) return;

        const data = await response.json();

        if (!data.user) return;

        const merged = Object.assign({}, getSavedUser(), data.user);

        saveUser(merged);
        fillProfileForm(merged);

        const welcomeMessage = document.getElementById("welcomeMessage");
        if (welcomeMessage) welcomeMessage.textContent = merged.name || "USER";

    } catch (error) {
        console.error("Account refresh error:", error);
    }
}

function fillProfileForm(user) {
    const nameInput = document.getElementById("profileNameInput");
    const birthdateInput = document.getElementById("profileBirthdateInput");
    const birthdateNote = document.getElementById("birthdateNote");

    if (nameInput) {
        nameInput.value = user.name || "";
    }

    if (birthdateInput) {
        // أقصى تاريخ مسموح بيه هو النهاردة
        birthdateInput.max = new Date().toISOString().split("T")[0];

        if (user.birthdate) {
            birthdateInput.value = user.birthdate;
            birthdateInput.disabled = true;
        } else {
            birthdateInput.disabled = false;
        }
    }

    if (birthdateNote) {
        birthdateNote.textContent = user.birthdate
            ? "BIRTHDATE LOCKED — YOU CANNOT CHANGE IT."
            : "ONCE SAVED, THIS CANNOT BE CHANGED. UNLOCKS THE BDAY15 BIRTHDAY DISCOUNT.";

        birthdateNote.classList.toggle("is-locked", Boolean(user.birthdate));
    }
}

function setupProfileForm() {
    const form = document.getElementById("profileForm");

    if (!form || form.dataset.bound === "true") return;

    form.dataset.bound = "true";

    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        const nameInput = document.getElementById("profileNameInput");
        const birthdateInput = document.getElementById("profileBirthdateInput");
        const messageElem = document.getElementById("profileMessage");
        const saveBtn = document.getElementById("saveProfileBtn");

        function showMessage(text, isSuccess) {
            if (!messageElem) return;
            messageElem.style.color = isSuccess ? "#4dff88" : "#ff4d4d";
            messageElem.textContent = text;
        }

        const payload = {};

        if (nameInput) {
            const cleanName = nameInput.value.trim();

            if (cleanName.length < 2) {
                showMessage("NAME MUST BE AT LEAST 2 CHARACTERS.", false);
                return;
            }

            payload.name = cleanName;
        }

        if (birthdateInput && !birthdateInput.disabled && birthdateInput.value) {
            payload.birthdate = birthdateInput.value;
        }

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerText = "SAVING...";
        }

        try {
            const response = await fetch(`${ZELL_API}/profile`, {
                method: "PATCH",
                headers: authHeaders(),
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                showMessage((data.message || "UPDATE FAILED.").toUpperCase(), false);
                return;
            }

            const merged = Object.assign({}, getSavedUser(), data.user);
            saveUser(merged);
            fillProfileForm(merged);

            const welcomeMessage = document.getElementById("welcomeMessage");
            if (welcomeMessage) welcomeMessage.textContent = merged.name || "USER";

            showMessage("PROFILE UPDATED SUCCESSFULLY.", true);

        } catch (error) {
            console.error("Profile update error:", error);
            showMessage("SERVER CONNECTION FAILED.", false);

        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerText = "SAVE CHANGES";
            }
        }
    });
}

/* ------------------------------
   GLOBAL PROMO NOTE (ZELL10)
   بيتحقن في كل الصفحات أوتوماتيك
------------------------------ */
function setupGlobalNote() {
    let container = document.getElementById("noteContainer");

    if (!container) {
        container = document.createElement("div");
        container.id = "noteContainer";
        container.className = "note-container";
        document.body.appendChild(container);
    }

    const user = getSavedUser();

    const signInBlock = user
        ? ""
        : `
            <p class="note-secondary">Sign in and get 5% OFF your order.</p>
            <div class="note-drawer-actions">
                <a href="login.html" class="drawer-btn">SIGN IN</a>
            </div>
        `;

    container.innerHTML = `
        <span id="noteTrigger" class="note-text-link">Note</span>

        <div id="discountBanner" class="note-drawer">
            <p class="note-primary">
                Use promo code <strong>ZELL10</strong> at checkout for 10% OFF.
            </p>
            ${signInBlock}
            <button id="closeBannerBtn" class="drawer-close" aria-label="Close note">&times;</button>
        </div>
    `;

    container.style.display = "block";

    const noteTrigger = document.getElementById("noteTrigger");
    const discountBanner = document.getElementById("discountBanner");
    const closeBannerBtn = document.getElementById("closeBannerBtn");

    if (noteTrigger && discountBanner) {
        noteTrigger.addEventListener("click", () => {
            discountBanner.classList.toggle("open");
        });
    }

    if (closeBannerBtn && discountBanner) {
        closeBannerBtn.addEventListener("click", () => {
            discountBanner.classList.remove("open");
        });
    }
}

/* ------------------------------
   BIRTHDAY GREETING
------------------------------ */
function isHomePage() {
    const path = window.location.pathname;

    return path.includes("test.html") ||
        path.includes("index.html") ||
        path.endsWith("/") ||
        path === "";
}

function showBirthdayGreeting(user) {
    if (document.getElementById("birthdayGreeting")) return;

    const firstName = String(user.name || "").trim().split(" ")[0] || "FRIEND";

    const overlay = document.createElement("div");
    overlay.id = "birthdayGreeting";
    overlay.className = "birthday-overlay";

    overlay.innerHTML = `
        <div class="birthday-box" role="dialog" aria-modal="true" aria-labelledby="birthdayHeading">
            <p class="eyebrow">CASE FILE / PERSONAL</p>

            <h2 id="birthdayHeading">HAPPY BIRTHDAY, ${firstName.toUpperCase()}</h2>

            <p class="birthday-text">
                One year closer to the truth. Today only, the archive opens
                a little wider for you.
            </p>

            <div class="birthday-code">
                <span>YOUR CODE</span>
                <strong>BDAY15</strong>
                <span>15% OFF — TODAY ONLY</span>
            </div>

            <button type="button" id="closeBirthdayBtn" class="discover-button">
                CONTINUE
            </button>
        </div>
    `;

    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add("visible"));

    function closeGreeting() {
        overlay.classList.remove("visible");
        setTimeout(() => overlay.remove(), 300);
    }

    const closeBtn = document.getElementById("closeBirthdayBtn");
    if (closeBtn) closeBtn.addEventListener("click", closeGreeting);

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) closeGreeting();
    });

    document.addEventListener("keydown", function onEscape(event) {
        if (event.key === "Escape") {
            closeGreeting();
            document.removeEventListener("keydown", onEscape);
        }
    });
}

async function setupBirthdayGreeting() {
    if (!isHomePage()) return;

    const user = getSavedUser();

    if (!user) return;

    let birthdate = user.birthdate;

    // لو البيانات المخزّنة قديمة ومفيهاش تاريخ ميلاد، بنسأل السيرفر
    if (birthdate === undefined && getSessionToken()) {
        try {
            const response = await fetch(`${ZELL_API}/me`, { headers: authHeaders() });

            if (response.ok) {
                const data = await response.json();

                if (data.user) {
                    saveUser(Object.assign({}, user, data.user));
                    birthdate = data.user.birthdate;
                }
            }
        } catch (error) {
            console.error("Birthday check error:", error);
        }
    }

    if (!isBirthdayToday(birthdate)) return;

    // الرسالة تظهر مرة واحدة في اليوم
    const greetedKey = `zellBirthdayGreeted_${new Date().getFullYear()}`;

    if (localStorage.getItem(greetedKey) === "true") return;

    localStorage.setItem(greetedKey, "true");

    showBirthdayGreeting(user);
}

/* ------------------------------
   PROFILE IMAGE EDITOR
------------------------------ */
function setupProfileImage() {
    const imageInput = document.getElementById("imageInput");
    const profileImage = document.getElementById("profileImage");
    const imageEditor = document.getElementById("imageEditor");
    const cropArea = document.querySelector(".crop-area");
    const cropImage = document.getElementById("cropImage");
    const zoomRange = document.getElementById("zoomRange");
    const cancelCrop = document.getElementById("cancelCrop");
    const saveCrop = document.getElementById("saveCrop");

    if (
        !imageInput ||
        !profileImage ||
        !imageEditor ||
        !cropArea ||
        !cropImage ||
        !zoomRange ||
        !cancelCrop ||
        !saveCrop
    ) {
        return;
    }

    const savedUserText =
        localStorage.getItem("zellUser");

    if (!savedUserText) return;

    let user;

    try {
        user = JSON.parse(savedUserText);
    } catch (error) {
        return;
    }

    const userId = user.id || user.email;
    const imageKey = "zellProfileImage_" + userId;
    const savedImage = localStorage.getItem(imageKey);

    if (savedImage) {
        profileImage.src = savedImage;
    }

    let imageObject = new Image();

    let zoom = 1;
    let imageX = 0;
    let imageY = 0;

    let isDragging = false;

    let startPointerX = 0;
    let startPointerY = 0;

    let startImageX = 0;
    let startImageY = 0;

    function getImageScale() {
        return Math.max(
            cropArea.clientWidth / imageObject.naturalWidth,
            cropArea.clientHeight / imageObject.naturalHeight
        );
    }

    function updateImagePosition() {
        cropImage.style.transform =
            `translate(${imageX}px, ${imageY}px) scale(${zoom})`;
    }

    function centerImage() {
        const areaWidth = cropArea.clientWidth;
        const areaHeight = cropArea.clientHeight;

        const imageWidth = imageObject.naturalWidth;
        const imageHeight = imageObject.naturalHeight;

        const scale = Math.max(
            areaWidth / imageWidth,
            areaHeight / imageHeight
        );

        const displayedWidth = imageWidth * scale;
        const displayedHeight = imageHeight * scale;

        cropImage.style.width =
            `${displayedWidth}px`;

        cropImage.style.height =
            `${displayedHeight}px`;

        imageX =
            (areaWidth - displayedWidth) / 2;

        imageY =
            (areaHeight - displayedHeight) / 2;

        zoom = 1;
        zoomRange.value = "1";

        updateImagePosition();
    }

    imageInput.addEventListener("change", function () {
        const file = imageInput.files[0];

        if (!file || !file.type.startsWith("image/")) {
            return;
        }

        const reader = new FileReader();

        reader.onload = function (event) {
            imageObject = new Image();

            imageObject.onload = function () {
                cropImage.src = event.target.result;

                zoom = 1;
                zoomRange.value = "1";

                imageEditor.hidden = false;

                requestAnimationFrame(centerImage);
            };

            imageObject.src = event.target.result;
        };

        reader.readAsDataURL(file);
    });

    zoomRange.addEventListener("input", function () {
        const oldZoom = zoom;
        const newZoom = Number(zoomRange.value);

        const centerX =
            cropArea.clientWidth / 2;

        const centerY =
            cropArea.clientHeight / 2;

        imageX =
            centerX -
            (centerX - imageX) *
            (newZoom / oldZoom);

        imageY =
            centerY -
            (centerY - imageY) *
            (newZoom / oldZoom);

        zoom = newZoom;

        updateImagePosition();
    });

    cropArea.addEventListener("pointerdown", function (event) {
        isDragging = true;

        startPointerX = event.clientX;
        startPointerY = event.clientY;

        startImageX = imageX;
        startImageY = imageY;

        cropArea.setPointerCapture(event.pointerId);
    });

    cropArea.addEventListener("pointermove", function (event) {
        if (!isDragging) return;

        imageX =
            startImageX +
            (event.clientX - startPointerX);

        imageY =
            startImageY +
            (event.clientY - startPointerY);

        updateImagePosition();
    });

    cropArea.addEventListener("pointerup", () => {
        isDragging = false;
    });

    cropArea.addEventListener("pointercancel", () => {
        isDragging = false;
    });

    cancelCrop.addEventListener("click", function () {
        imageEditor.hidden = true;
        imageInput.value = "";
    });

    saveCrop.addEventListener("click", function () {
        const canvas =
            document.createElement("canvas");

        const context =
            canvas.getContext("2d");

        const outputSize = 500;

        canvas.width = outputSize;
        canvas.height = outputSize;

        const finalScale =
            getImageScale() * zoom;

        const sourceWidth =
            cropArea.clientWidth / finalScale;

        const sourceHeight =
            cropArea.clientHeight / finalScale;

        const sourceX =
            -imageX / finalScale;

        const sourceY =
            -imageY / finalScale;

        context.clearRect(
            0,
            0,
            outputSize,
            outputSize
        );

        context.drawImage(
            imageObject,
            sourceX,
            sourceY,
            sourceWidth,
            sourceHeight,
            0,
            0,
            outputSize,
            outputSize
        );

        const finalImage =
            canvas.toDataURL("image/jpeg", 0.9);

        profileImage.src = finalImage;

        localStorage.setItem(
            imageKey,
            finalImage
        );

        imageEditor.hidden = true;
        imageInput.value = "";
    });
}

/* ------------------------------
   CART & BADGE CONTROLLER
------------------------------ */
let globalSelectedSize = '';

function setupSizeSelector() {
    const sizeBtns = document.querySelectorAll('.size-btn');
    sizeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            sizeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            globalSelectedSize = btn.innerText.trim();
        });
    });
}

function updateCartBadge() {
    const cartBadges =
        document.querySelectorAll(
            "#cart-badge, .cart-badge"
        );

    const cart =
        getStorageArray("zellCart");

    const totalItems =
        cart.reduce(
            (total, item) =>
                total +
                (Number(item.quantity) || 1),
            0
        );

    cartBadges.forEach(badge => {
        if (totalItems > 0) {
            badge.textContent = totalItems;
            badge.style.display = "inline-block";
        } else {
            badge.textContent = "";
            badge.style.display = "none";
        }
    });
}

function addToCart(product) {
    if (!product) return;

    let cart =
        getStorageArray("zellCart");

    const pId =
        product.id || product.productId;

    const chosenSize = globalSelectedSize || product.size || 'M';

    const existingProduct =
        cart.find(
            item =>
                (item.productId || item.id) === pId && item.size === chosenSize
        );

    if (existingProduct) {
        existingProduct.quantity =
            (existingProduct.quantity || 1) + 1;
    } else {
        cart.push({
            id: pId,
            productId: pId,
            name: product.name,
            price: product.price,
            collection: product.collection,
            image: product.image,
            size: chosenSize,
            quantity: 1
        });
    }

    localStorage.setItem(
        "zellCart",
        JSON.stringify(cart)
    );

    updateCartBadge();

    alert("PRODUCT ADDED TO CART");
}

function setupSideNav() {
    const menuToggleBtn =
        document.getElementById("menuToggleBtn") ||
        document.getElementById("menuBtn");

    const sideNavDrawer =
        document.getElementById("sideNavDrawer");

    const sideNavOverlay =
        document.getElementById("sideNavOverlay");

    const closeSideNav =
        document.getElementById("closeSideNav");

    function openDrawer() {
        if (sideNavDrawer) {
            sideNavDrawer.classList.add("active");
        }

        if (sideNavOverlay) {
            sideNavOverlay.classList.add("active");
        }
    }

    function closeDrawer() {
        if (sideNavDrawer) {
            sideNavDrawer.classList.remove("active");
        }

        if (sideNavOverlay) {
            sideNavOverlay.classList.remove("active");
        }
    }

    if (menuToggleBtn) {
        menuToggleBtn.onclick = (e) => {
            e.preventDefault();
            openDrawer();
        };
    }

    if (closeSideNav) {
        closeSideNav.onclick = (e) => {
            e.preventDefault();
            closeDrawer();
        };
    }

    if (sideNavOverlay) {
        sideNavOverlay.onclick = closeDrawer;
    }
}

/* ------------------------------
   PRODUCTS API LOADER
------------------------------ */
async function loadProduct(productId) {
    try {
        const response =
            await fetch(
                `${ZELL_API}/products/${productId}`
            );

        if (!response.ok) {
            throw new Error(
                `Product request failed: ${response.status}`
            );
        }

        const product =
            await response.json();

        const productName =
            document.getElementById("productName");

        const productCollection =
            document.getElementById("productCollection");

        const storyDescription =
            document.getElementById("storyDescription");

        const productDescription =
            document.getElementById("productDescription");

        const productImage =
            document.getElementById("productImage");

        if (productName) {
            productName.textContent =
                product.name || "";
        }

        if (productCollection) {
            productCollection.textContent =
                product.collection || "";
        }

        if (storyDescription) {
            storyDescription.textContent =
                product.description || "";
        }

        if (productDescription) {
            productDescription.textContent =
                product.description || "";
        }

        if (productImage) {
            productImage.src = product.image;
            productImage.alt =
                product.name || "ZELL PRODUCT";
        }

        updatePriceDisplay();

        const addToCartBtns =
            document.querySelectorAll(
                "#addToCartButton, .add-to-cart-btn, .add-to-cart"
            );

        addToCartBtns.forEach(btn => {
            const newBtn =
                btn.cloneNode(true);

            btn.replaceWith(newBtn);

            newBtn.addEventListener(
                "click",
                function (e) {
                    e.preventDefault();

                    const sizeBtns = document.querySelectorAll('.size-btn');
                    if (sizeBtns.length > 0 && !globalSelectedSize) {
                        alert("Please select a size first!");
                        return;
                    }

                    const token =
                        localStorage.getItem(
                            "zellSessionToken"
                        ) ||
                        localStorage.getItem(
                            "zellUser"
                        );

                    const finalPrice =
                        token
                            ? 950
                            : (product.price || 1000);

                    addToCart({
                        ...product,
                        price: finalPrice,
                        size: globalSelectedSize || 'M'
                    });
                }
            );
        });

    } catch (error) {
        console.error(
            "Product loading error:",
            error
        );
    }
}

function updatePriceDisplay() {
    const token =
        localStorage.getItem(
            "zellSessionToken"
        ) ||
        localStorage.getItem(
            "zellUser"
        );

    const priceElem =
        document.getElementById("productPrice");

    const registerNote =
        document.getElementById("registerNote");

    if (priceElem) {
        if (token) {
            priceElem.innerHTML = `
                <span style="text-decoration: line-through; color: #555; font-size: 0.85em; margin-right: 8px;">
                    1000 EGP
                </span>

                <span style="color: #ffffff;">
                    950 EGP
                </span>
            `;
        } else {
            priceElem.innerHTML =
                `<span>1000 EGP</span>`;
        }
    }

    if (registerNote) {
        registerNote.hidden = Boolean(token);
    }

}

/* ------------------------------
   CHECKOUT / SHIPPING / DISCOUNT LOGIC
------------------------------ */
let appliedDiscountRate = 0;
let appliedDiscountLabel = "DISCOUNT";
let appliedCouponCode = "";

// بيانات الشحن الحالية المختارة
let selectedShipping = null;

// كل المحافظات جاية من السيرفر عشان يبقى فيه مصدر واحد للأسعار
let shippingZones = [];

async function loadShippingZones() {
    const select = document.getElementById("customerGovernorate");

    if (!select) return;

    try {
        const response = await fetch(`${ZELL_API}/shipping-zones`);
        const data = await response.json();

        shippingZones = data.zones || [];

        const deltaZones = shippingZones.filter(zone => zone.zone === "delta");
        const otherZones = shippingZones.filter(zone => zone.zone !== "delta");

        function buildOptions(zones) {
            return zones
                .map(zone => `<option value="${zone.governorate}">${zone.governorate.toUpperCase()}</option>`)
                .join("");
        }

        select.innerHTML = `
            <option value="">— SELECT GOVERNORATE —</option>
            <optgroup label="CAIRO &amp; DELTA — 70 EGP / 3 DAYS">
                ${buildOptions(deltaZones)}
            </optgroup>
            <optgroup label="OTHER GOVERNORATES — 90 EGP / 1 WEEK">
                ${buildOptions(otherZones)}
            </optgroup>
        `;

        select.addEventListener("change", handleGovernorateChange);

        // استرجاع آخر محافظة اختارها العميل
        const remembered = localStorage.getItem("zellGovernorate");

        if (remembered && shippingZones.some(zone => zone.governorate === remembered)) {
            select.value = remembered;
        }

        handleGovernorateChange();

    } catch (error) {
        console.error("Shipping zones error:", error);

        select.innerHTML = `<option value="">SHIPPING UNAVAILABLE — RETRY LATER</option>`;
    }
}

function handleGovernorateChange() {
    const select = document.getElementById("customerGovernorate");
    const noteElem = document.getElementById("deliveryNote");

    if (!select) return;

    selectedShipping =
        shippingZones.find(zone => zone.governorate === select.value) || null;

    if (selectedShipping) {
        localStorage.setItem("zellGovernorate", selectedShipping.governorate);
    }

    if (noteElem) {
        if (selectedShipping) {
            noteElem.textContent =
                `${selectedShipping.zoneLabel} — DELIVERY WITHIN ${selectedShipping.deliveryEstimate}`;
            noteElem.style.color = "#777";
        } else {
            noteElem.textContent = "SELECT A GOVERNORATE TO CALCULATE SHIPPING.";
            noteElem.style.color = "#555";
        }
    }

    updateCheckoutTotals();
}

function updateCheckoutTotals() {
    const cart = getStorageArray("zellCart");

    let subtotal = 0;

    const checkoutCartItems = document.getElementById("checkoutCartItems");

    if (!checkoutCartItems) {
        return;
    }

    if (cart.length === 0) {
        checkoutCartItems.innerHTML = `
            <div style="padding: 20px 0; color: #888; font-size: 11px; letter-spacing: 2px;">
                YOUR CART IS EMPTY.
            </div>
        `;
    } else {
        const itemsHTML = cart.map(item => {
            const itemPrice = Number(item.price) || 0;
            const itemQty = Number(item.quantity) || 1;
            const itemTotal = itemPrice * itemQty;
            const itemSize = item.size || "M";

            subtotal += itemTotal;

            return `
                <div style="display: flex; justify-content: space-between; margin: 10px 0; border-bottom: 1px solid #222; padding-bottom: 8px;">
                    <div>
                        <div style="font-weight: 500; color: #fff;">
                            ${item.name} <span style="color: #888; font-size: 0.85em;">(SIZE: ${itemSize})</span>
                        </div>

                        <div style="font-size: 0.85em; color: #888;">
                            QTY: ${itemQty} x ${itemPrice} EGP
                        </div>
                    </div>

                    <div style="font-weight: 500; color: #fff;">
                        ${itemTotal} EGP
                    </div>
                </div>
            `;
        }).join("");

        checkoutCartItems.innerHTML = itemsHTML;
    }

    // الخصم بيتحسب على المنتجات بس — الشحن مش بيتخصم عليه
    const discountAmount = subtotal * appliedDiscountRate;
    const shippingCost = selectedShipping ? Number(selectedShipping.cost) : 0;
    const finalTotal = subtotal - discountAmount + shippingCost;

    const subtotalEl = document.getElementById("subtotalAmount");
    const discountRow = document.getElementById("discountRow");
    const discountLabelEl = document.getElementById("discountLabel");
    const discountEl = document.getElementById("discountAmount");
    const shippingRow = document.getElementById("shippingRow");
    const shippingLabelEl = document.getElementById("shippingLabel");
    const shippingEl = document.getElementById("shippingAmount");
    const finalTotalEl = document.getElementById("finalTotalAmount");
    const checkoutTotalHeader = document.getElementById("checkoutTotal");

    if (subtotalEl) {
        subtotalEl.textContent = `${subtotal.toLocaleString()} EGP`;
    }

    if (finalTotalEl) {
        finalTotalEl.textContent = `${finalTotal.toLocaleString()} EGP`;
    }

    if (checkoutTotalHeader) {
        checkoutTotalHeader.textContent = `${finalTotal.toLocaleString()} EGP`;
    }

    if (discountRow && discountEl) {
        if (appliedDiscountRate > 0) {
            discountRow.style.display = "flex";
            if (discountLabelEl) discountLabelEl.textContent = appliedDiscountLabel;
            discountEl.textContent = `-${discountAmount.toLocaleString()} EGP`;
        } else {
            discountRow.style.display = "none";
        }
    }

    if (shippingRow && shippingEl) {
        if (selectedShipping) {
            shippingRow.style.display = "flex";

            if (shippingLabelEl) {
                shippingLabelEl.textContent =
                    `SHIPPING — ${selectedShipping.governorate.toUpperCase()}`;
            }

            shippingEl.textContent = `${shippingCost.toLocaleString()} EGP`;
        } else {
            shippingRow.style.display = "none";
        }
    }
}

function clearAppliedCoupon() {
    appliedDiscountRate = 0;
    appliedDiscountLabel = "DISCOUNT";
    appliedCouponCode = "";
}

// التحقق من الكوبون بيتم على السيرفر — الواجهة مبتقررش لوحدها
async function applyDiscount(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    const couponInputElem = document.getElementById("couponInput");
    const couponMessage = document.getElementById("couponMessage");
    const applyBtn = document.getElementById("applyCouponBtn");

    if (!couponInputElem) return;

    const couponInput = couponInputElem.value.trim().toUpperCase();

    function showMessage(text, isSuccess) {
        if (!couponMessage) return;
        couponMessage.style.color = isSuccess ? "#4CAF50" : "#ff4d4d";
        couponMessage.textContent = text;
    }

    if (couponInput === "") {
        clearAppliedCoupon();
        showMessage("Please enter a coupon code.", false);
        updateCheckoutTotals();
        return;
    }

    if (applyBtn) {
        applyBtn.disabled = true;
        applyBtn.innerText = "CHECKING...";
    }

    try {
        const response = await fetch(`${ZELL_API}/validate-coupon`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ couponCode: couponInput })
        });

        const data = await response.json();

        if (data.valid) {
            appliedDiscountRate = Number(data.rate) || 0;
            appliedDiscountLabel = data.label || "DISCOUNT";
            appliedCouponCode = data.code || couponInput;

            showMessage(data.message || "Coupon applied.", true);
        } else {
            clearAppliedCoupon();
            showMessage(data.message || "Invalid coupon code.", false);
        }

    } catch (error) {
        console.error("Coupon validation error:", error);

        clearAppliedCoupon();
        showMessage("Could not verify the coupon. Check your connection.", false);

    } finally {
        if (applyBtn) {
            applyBtn.disabled = false;
            applyBtn.innerText = "APPLY";
        }

        updateCheckoutTotals();
    }
}

/* ------------------------------
   CHECKOUT
------------------------------ */

let checkoutInProgress = false;

function setupProductFlip() {
    const flipBtn = document.getElementById("flipButton");
    const flipCard = document.getElementById("productFlipCard");

    if (!flipBtn || !flipCard) return;

    flipBtn.addEventListener("click", function () {
        flipCard.classList.toggle("flipped");
        flipBtn.classList.toggle("flipped");
    });
}

function setupCheckoutPage() {
    const checkoutForm = document.getElementById("checkoutForm");
    const submitBtn = document.getElementById("submitOrderBtn");

    if (!checkoutForm || !submitBtn) return;

    // Fill user details automatically if logged in
    const savedUser = getSavedUser();

    if (savedUser) {
        const emailElem = document.getElementById("customerEmail");
        const nameElem = document.getElementById("customerName");

        if (emailElem && savedUser.email) {
            emailElem.value = savedUser.email;
        }

        if (nameElem && savedUser.name && !nameElem.value) {
            nameElem.value = savedUser.name;
        }
    }

    loadShippingZones();
    updateCheckoutTotals();

    submitBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();

        executeCheckout(e);
    });

    checkoutForm.addEventListener("submit", function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();

        executeCheckout(e);
    });
}

async function executeCheckout(e) {
    if (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
    }

    if (checkoutInProgress) {
        return false;
    }

    const orderMessage = document.getElementById("orderMessage");
    const submitBtn = document.getElementById("submitOrderBtn");

    try {
        const customerNameElement = document.getElementById("customerName");
        const emailElement = document.getElementById("customerEmail");
        const phoneElement = document.getElementById("customerPhone");
        const addressElement = document.getElementById("customerAddress");

        const governorateElement = document.getElementById("customerGovernorate");

        const customerName = customerNameElement ? customerNameElement.value.trim() : "";
        const userEmail = emailElement ? emailElement.value.trim() : "";
        const phone = phoneElement ? phoneElement.value.trim() : "";
        const address = addressElement ? addressElement.value.trim() : "";
        const governorate = governorateElement ? governorateElement.value.trim() : "";

        if (!customerName || !userEmail || !phone || !address) {
            if (orderMessage) {
                orderMessage.style.display = "block";
                orderMessage.style.color = "#ff4d4d";
                orderMessage.innerText = "Please fill in all shipping details.";
            }
            return false;
        }

        if (!governorate) {
            if (orderMessage) {
                orderMessage.style.display = "block";
                orderMessage.style.color = "#ff4d4d";
                orderMessage.innerText = "Please select your governorate so we can calculate shipping.";
            }

            if (governorateElement) {
                governorateElement.focus();
            }

            return false;
        }

        const rawCart = getStorageArray("zellCart");

        if (rawCart.length === 0) {
            if (orderMessage) {
                orderMessage.style.display = "block";
                orderMessage.style.color = "#ff4d4d";
                orderMessage.innerText = "Your cart is empty!";
            }
            return false;
        }

        const items = rawCart.map(item => {
            const pId = Number(item.productId || item.id || 1);
            return {
                productId: isNaN(pId) ? 1 : pId,
                quantity: Number(item.quantity || 1),
                price: Number(item.price || 950),
                name: item.name || "ZELL Product",
                size: item.size || "M"
            };
        });

        // بنبعت الكود اللي السيرفر وافق عليه بس، مش اللي مكتوب في الخانة
        const couponCode = appliedCouponCode;

        checkoutInProgress = true;

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = "PROCESSING...";
        }

        const token = localStorage.getItem("zellSessionToken");
        const headers = { "Content-Type": "application/json" };
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch(`${ZELL_API}/checkout`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                items,
                customerName,
                userEmail,
                phone,
                address,
                governorate,
                couponCode
            })
        });

        const data = await response.json();

        if (!response.ok) {
            checkoutInProgress = false;

            if (orderMessage) {
                orderMessage.style.display = "block";
                orderMessage.style.color = "#ff4d4d";
                orderMessage.innerText = data.message || "Failed to place order.";
            }

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = "CONFIRM & PLACE ORDER";
            }

            return false;
        }

        /* ------------------------------
           ORDER SUCCESS
        ------------------------------ */
        localStorage.removeItem("zellCart");

        if (orderMessage) {
            orderMessage.style.display = "block";
            orderMessage.style.color = "#4dff88";
            const eta = data.shipping && data.shipping.deliveryEstimate
                ? ` — DELIVERY WITHIN ${data.shipping.deliveryEstimate}`
                : "";

            orderMessage.innerText =
                `ORDER PLACED SUCCESSFULLY! CODE: ${data.orderCode}${eta}`;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = "ORDER PLACED — REDIRECTING...";
            submitBtn.style.backgroundColor = "#4dff88";
            submitBtn.style.color = "#000";
        }

        updateCartBadge();
        updateCheckoutTotals();

        setTimeout(() => {
            window.location.assign("test.html");
        }, 3000);

        return false;

    } catch (error) {
        console.error("Checkout Error Caught:", error);

        checkoutInProgress = false;

        if (orderMessage) {
            orderMessage.style.display = "block";
            orderMessage.style.color = "#ff4d4d";
            orderMessage.innerText = "Network/JS Error: " + error.message;
        }

        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = "CONFIRM & PLACE ORDER";
        }
    }

    return false;
}

/* ------------------------------
   INITIALIZATION
------------------------------ */
document.addEventListener("DOMContentLoaded", function () {
    updateEvidenceCount();
    updateAccountLinks();
    setupAccountPage();
    setupProfileImage();
    updateCartBadge();
    setupSideNav();
    setupCheckoutPage();
    setupProductFlip();
    setupSizeSelector();

    // الملاحظة العامة بكود ZELL10 على كل الصفحات
    setupGlobalNote();

    // رسالة التهنئة لصاحب عيد الميلاد عند دخول الموقع
    setupBirthdayGreeting();

    if (window.location.pathname.includes("impact.html")) {
        loadProduct(2);
    }

    if (window.location.pathname.includes("imagination.html")) {
        loadProduct(1);
    }
});