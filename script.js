// 0️⃣ モジュールのインポート
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, getRedirectResult } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDocs, getFirestore, collection, addDoc, doc, setDoc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

//1️⃣ Firebase 初期化・キャッシュ
// RAMに一時的に保存（リロードで消える）
let metaCache = null;        // ← 目次箱
const noteCache = {};       // ← 本文キャッシュ

// firebase
const firebaseConfig = {
  apiKey: "AIzaSyBOAzYlxRsAqlov_valRrOlYuD_O3irV6A",
  authDomain: "dreadnote9-orion.firebaseapp.com",
  projectId: "dreadnote9-orion",
  storageBucket: "dreadnote9-orion.firebasestorage.app",
  messagingSenderId: "52518748481",
  appId: "1:52518748481:web:41bffae85624045e1261c0"
};
// ✅ 呼び出しの可能性あり（内部で軽くプロジェクト確認など）
const app = initializeApp( firebaseConfig );
// ❌ ローカルオブジェクト作成のみ → 通信なし
const auth = getAuth( app );
// ❌ ローカルオブジェクト作成のみ → 通信なし
const db = getFirestore( app );
// ✅ 確実に呼び出し発生（サーバーに問い合わせて認証確認）
getRedirectResult( auth ).catch( () => { } );


/* 2️⃣DOM要素格納 このブロックはFirebaseへの通信無し*/
// すなわちHTML内の各要素（ログイン画面、一覧画面、ゴミ箱画面、エディター画面）を変数に格納する
const views = {
	login: document.getElementById( 'view-login' ),
	list: document.getElementById( 'view-list' ) || document.querySelector( '#sidebar #view-list' ),
	trash: document.getElementById( 'view-trash' ),
	editor: document.getElementById( 'view-editor' )
};
//メモ一覧、ゴミ箱、エディター、ユーザーアイコン、メニュー等を表示する要素を取得している
const noteList = document.getElementById( 'note-list' );
const trashList = document.getElementById( 'trash-list' );
const editor = document.getElementById( 'editor' );

const userIcon = document.getElementById( 'user-icon' );
const userIcon2 = document.getElementById( 'user-icon2' );
const userMenu = document.getElementById( 'user-menu' );
const fontBtn = document.getElementById( 'font-size-btn' );
const fontPopup = document.getElementById( 'font-size-popup' );
const fontSlider = document.getElementById( 'font-size-slider' );
const fontValue = document.getElementById( 'font-size-value' );
const toast = document.getElementById( 'toast' );
const darkBtn = document.getElementById( 'dark-btn' );
const spreadBtn = document.getElementById( 'spread-btn' );

const sidebar = document.getElementById( 'sidebar' );
const sidebarToggle = document.getElementById( 'sidebar-toggle' );
//2は閉じるボタン
const sidebarToggle2 = document.getElementById( 'sidebar-toggle2' );
const saveIndicator = document.getElementById( 'saveIndicator' );
const saveStatus = saveIndicator.querySelector( '.saveStatus' );
const timestampEl = saveIndicator.querySelector( '.timestamp' );

editor.contentEditable = 'true';

let saveTimer = null;
let longPress = false;
let lastTouch = null;
let isTouchDevice = false;
let requireDoubleTap = false;
let lastTapTime = 0;
let currentNoteId = null;
let noteLoaded = null;
let localUpdated = 0;
let hideStatusTimer = null;


// 3️⃣UI操作（フォント、ダークモード、トーストなど）
function formatDateTime( date ) {
	const y = date.getFullYear();
	const m = String( date.getMonth() + 1 ).padStart( 2, '0' );
	const d = String( date.getDate() ).padStart( 2, '0' );
	const hh = String( date.getHours() ).padStart( 2, '0' );
	const mm = String( date.getMinutes() ).padStart( 2, '0' );
	const ss = String( date.getSeconds() ).padStart( 2, '0' );
	return `${y}/${m}/${d} ${hh}:${mm}:${ss}`;
}

sidebarToggle.onclick = async () => {
	sidebar.classList.toggle( 'show' );

	// サイドバーを開いたらメモ一覧をロード

	if ( sidebar.classList.contains( 'show' ) ) {
		requireDoubleTap = true; // ← ★リセット
		await loadMetaOnce();   // まず metaCache をロード
		await loadNotes();      // メモ一覧を描画
	}
};
function closeSidebar() {
	sidebar.classList.remove( 'show' );
}
sidebarToggle2.onclick = closeSidebar;

document.addEventListener( 'click', ( e ) => {
	if ( sidebar.classList.contains( 'show' ) && !sidebar.contains( e.target ) && e.target !== sidebarToggle ) {
		sidebar.classList.remove( 'show' );
	}

	if ( !fontPopup.contains( e.target ) && e.target !== fontBtn ) {
		fontPopup.style.display = 'none';
	}
	// 他の場所をクリックしたらメニューが閉じる

	if ( !userMenu.contains( e.target ) && e.target !== userIcon ) userMenu.style.display = 'none';
	document.querySelectorAll( '.menu-popup' ).forEach( menu => {
		const btn = menu.previousSibling;
		if ( !menu.contains( e.target ) && !btn.contains( e.target ) ) menu.style.display = 'none';
	} );
} );

userIcon.onclick = () => { userMenu.style.display = ( userMenu.style.display === 'block' ) ? 'none' : 'block'; }
userIcon2.onclick = () => { userMenu.style.display = ( userMenu.style.display === 'block' ) ? 'none' : 'block'; }
// Aa押した時の挙動
fontBtn.onclick = e => {
	//ボタンを親要素に影響させない
	e.stopPropagation();
	// スライダーのやつ、fontPopup表示されていれば閉じる、閉じていれば表示する
	fontPopup.style.display = ( fontPopup.style.display === 'block' ) ? 'none' : 'block';
	// 押されたらユーザーメニューを非表示にする
	userMenu.style.display = 'none';
};

// スライダーが確定されたら文字サイズ変更
fontSlider.oninput = e => {
	const size = fontSlider.value + 'px';
	// body全体、に文字サイズを反映
	document.body.style.fontSize = size;
	// editorはHTMLのid editorのこと
	editor.style.fontSize = size;
	//一覧画面もサイズ反映
	noteList.querySelectorAll( 'li' ).forEach( li => {
		li.style.fontSize = size;
	} );
	//スライダーの横の文字も反映
	fontValue.textContent = size;
	//その端末にフォントサイズが残る
	localStorage.setItem( 'dreadnote-font-size', fontSlider.value );
};

// 端末から反映
const savedSize = localStorage.getItem( 'dreadnote-font-size' );
//端末に初期値があればそれにする　ずれの原因これじゃね？まあいいや
if ( savedSize ) {
	editor.style.fontSize = savedSize + 'px';
	fontSlider.value = savedSize;
	fontValue.textContent = savedSize + 'px';
	noteList.querySelectorAll( 'li' ).forEach( li => li.style.fontSize = savedSize + 'px' );
}

// 初期状態を localStorage から取得

// localStorage の値を取得
let darkOn = localStorage.getItem('dreadnote-dark');
if ( darkOn ) document.body.classList.add( 'dark' );


if (darkOn === null) {
  // localStorage に値がなければ端末の設定を確認
  darkOn = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
} else {
  // localStorage に値がある場合は '1' が true, それ以外は false
  darkOn = darkOn === '1';
}

console.log('Dark mode:', darkOn);
//ダークモードにするかどうかは端末に保存
if ( darkBtn ) {
	darkBtn.textContent = darkOn ? 'Light mode' : 'Dark mode';
	darkBtn.onclick = ( e ) => {
		e.stopPropagation();
		document.body.classList.toggle( 'dark' );
		const isOn = document.body.classList.contains( 'dark' );
		localStorage.setItem(
			'dreadnote-dark',
			document.body.classList.contains( 'dark' ) ? '1' : '0'
		);
		darkBtn.textContent = isOn ? 'Light mode' : 'Dark mode';

	};
}
// 初期状態を localStorage から取得
const spreadOn = localStorage.getItem( 'dreadnote-spread' ) === '1';
if ( spreadOn ) document.body.classList.add( 'spread' );
// Spread mode toggle（ダークと同様）
if ( spreadBtn ) {
	spreadBtn.textContent = spreadOn ? '→←' : '←→';
	spreadBtn.onclick = ( e ) => {
		e.stopPropagation();
		document.body.classList.toggle( 'spread' );
		const isOn = document.body.classList.contains( 'spread' );
		localStorage.setItem(
			'dreadnote-spread',
			document.body.classList.contains( 'spread' ) ? '1' : '0'
		);
		spreadBtn.textContent = isOn ? '→←' : '←→';
	};
}

// 端末から保存状態を反映
if ( localStorage.getItem( 'dreadnote-dark' ) === '1' ) {
	document.body.classList.add( 'dark' );
}
if ( localStorage.getItem( 'dreadnote-spread' ) === '1' ) {
	document.body.classList.add( 'spread' );
}


/* トースト表示（4.000秒間）の関数設定 */
function showToast( msg, d = 4000 ) { toast.textContent = msg; toast.classList.add( 'show' ); setTimeout( () => toast.classList.remove( 'show' ), d ); }
function show( view ) {
	Object.values( views ).forEach( v => { if ( v ) v.hidden = true; } );
	if ( views[view] ) views[view].hidden = false;
}

/* 4️⃣ 認証処理（Google ログイン / ログアウト） */
const provider = new GoogleAuthProvider();
provider.setCustomParameters( {
	prompt: 'select_account'
} )

document.getElementById( 'google-login' ).onclick = async () => { try { await signInWithPopup( auth, provider ); } catch ( e ) { showToast( "Googleログイン失敗: " + e.message ); } };

document.getElementById( 'logout-btn' ).onclick = () => { closeSidebar(); userMenu.style.display = 'none'; sidebarToggle.style.display = 'none', metaCache = null; signOut( auth ); location.hash = '#login'; }

onAuthStateChanged( auth, async user => {
	// ★ ここで「画面を表示していい」と宣言
	document.body.classList.remove( 'auth-loading' );
	if ( !user ) {
		location.hash = '#login';
		sidebarToggle.style.display = 'none';
		show( 'login' );
		return;
	}

	if ( user.photoURL ) userIcon.src = user.photoURL;
	if ( user.photoURL ) userIcon2.src = user.photoURL;

	// ✅ まず metaCache をロード
	await loadMetaOnce();
	fixSizesOnce();

	// ★ 必ずここで遷移処理
	if ( !location.hash || location.hash === '#login' ) {
		location.hash = '#/list';
	}

	await navigate(); // ← 必ず呼ぶ
	sidebarToggle.style.display = 'block';
console.log(UserKey(auth.currentUser))

} );
window.addEventListener( 'hashchange', ( e ) => {
	if ( auth.currentUser ) {
		navigate();

	}
} );
function getEmailPrefix(email) {
  if (!email) return 'user';
  // @より前を取得
  let prefix = email.split('@')[0];
  // 英数字以外は削除（ピリオド・記号を取り除く）
  prefix = prefix.replace(/[^a-zA-Z0-9]/g, '');
  return prefix;
}

function UserKey(user) {
  const prefix = getEmailPrefix(user.email || '');
  const uid = user.uid; // UID は末尾に追加
  return `${prefix}-${uid}`;
}
//5️⃣ メモ関連の処理の関数（loadMeta, loadNotes, openEditor, saveNote, updateMeta など）
function renderTotalSize() {
	const el = document.getElementById( 'total-size' );
	if ( !el || !metaCache ) return;

	const bytes = metaCache.totalSize;
	el.textContent =
		bytes >= 1024 * 1024
			? ( bytes / ( 1024 * 1024 ) ).toFixed( 2 ) + ' MB'
			: Math.round( bytes / 1024 ) + ' KB';
}
function renderNoteCount() {
	const el = document.getElementById( 'note-count' );
	if ( !el ) return;

	const count = metaCache.notes.filter( m => !m.deleted ).length;
	el.textContent = `メモ ${count} 件`;
}
async function loadMetaOnce() {
	if ( metaCache ) return metaCache;

	let metaWasFixed = false;

	const metaRef = doc( db, 'users', `${auth.currentUser.email.split('@')[0]}-${auth.currentUser.uid}`, 'meta', 'main' );
	const snap = await getDoc( metaRef );

	if ( snap.exists() ) {
		metaCache = snap.data();
		if ( !Array.isArray( metaCache.notes ) ) {
			metaCache.notes = [];
			metaWasFixed = true;
		}
	} else {
		metaCache = { notes: [] };
		metaWasFixed = true;
	}

	// 🔁 meta が空なら Firestore から1回だけ復元
	if ( metaCache.notes.length === 0 ) {
		const notesSnap = await getDocs(
			collection( db, 'users', `${auth.currentUser.email.split('@')[0]}-${auth.currentUser.uid}`, 'notes' )
		);

		metaCache.notes = notesSnap.docs.map( d => {
			const m = d.data();
			return {
				id: d.id,
				title: m.title || '',
				updated: m.updated || Date.now(),
				deleted: !!m.deletedAt
			};
		} );

		metaWasFixed = true;
	}

	// 🧠 正規化（壊れたデータ防止）
	metaCache.notes.forEach( m => {
		if ( typeof m.deleted !== 'boolean' ) {
			m.deleted = false;
			metaWasFixed = true;
		}
		if ( typeof m.title !== 'string' ) {
			m.title = '';
			metaWasFixed = true;
		}
		if ( typeof m.updated !== 'number' ) {
			m.updated = Date.now();
			metaWasFixed = true;
		}
		if ( typeof m.size !== 'number' ) {
			m.size = 0;
			metaWasFixed = true;
		}
		// 🔹 ここに追加
		if ( typeof m.pinned !== 'boolean' ) {
			m.pinned = false;
			metaWasFixed = true;
		}
		if ( !m.pinnedDate ) {
			m.pinnedDate = null;
			metaWasFixed = true;
		}
	} );

	// ✅ 「直した時だけ」保存
	if ( metaWasFixed ) {
		await setDoc( metaRef, metaCache );
	}
	metaCache.totalSize = metaCache.notes.reduce(
		//  (sum, m) => sum + (m.deleted ? 0 : (m.size || 0)),
		( sum, m ) => sum + ( m.size || 0 ),
		0
	);

	renderTotalSize();

	return metaCache;
}

function closeAllMenus() {
	document.querySelectorAll( '.menu-popup' ).forEach( m => {
		m.style.display = 'none';
	} );
}
function htmlToMarkdown( html ) {
	// DOMParser で HTML をパース
	const parser = new DOMParser();
	const doc = parser.parseFromString( html, 'text/html' );

	function traverse( node ) {
		if ( !node ) return '';

		let md = '';

		switch ( node.nodeType ) {
			case Node.TEXT_NODE:
				return node.textContent;

			case Node.ELEMENT_NODE:
				const tag = node.tagName.toLowerCase();

				switch ( tag ) {
					case 'h1': return '# ' + traverseChildren( node ) + '\n\n';
					case 'h2': return '## ' + traverseChildren( node ) + '\n\n';
					case 'h3': return '### ' + traverseChildren( node ) + '\n\n';
					case 'h4': return '#### ' + traverseChildren( node ) + '\n\n';
					case 'h5': return '##### ' + traverseChildren( node ) + '\n\n';
					case 'h6': return '###### ' + traverseChildren( node ) + '\n\n';
					case 'strong':
					case 'b':
						return '**' + traverseChildren( node ) + '**';
					case 'em':
					case 'i':
						return '*' + traverseChildren( node ) + '*';
					case 'br':
						return '\n';
					case 'div':
					case 'p':
						return traverseChildren( node ) + '\n';
					case 'ul':
						return traverseList( node, '-' ) + '\n';
					case 'ol':
						return traverseList( node, '1.' ) + '\n';
					case 'img':
						const src = node.getAttribute( 'src' ) || '';
						const alt = node.getAttribute( 'alt' ) || '';
						if ( src.startsWith( 'data:' ) ) {
							return `![${alt}]()`; // base64は空白に
						} else {
							return `![${alt}](${src})`;
						}
					case 'a': {
						const href = node.getAttribute( 'href' ) || '';

						// aタグ内に img があるか確認
						const img = node.querySelector( 'img' );
						if ( img ) {
							// img を Markdown に変換
							const src = img.getAttribute( 'src' ) || '';
							const alt = img.getAttribute( 'alt' ) || '';
							if ( src.startsWith( 'data:' ) ) {
								return `![${alt}]()`; // base64画像は空白
							} else {
								return `![${alt}](${src})`; // URL画像は Markdown形式
							}
						}

						// 普通のリンク
						const text = node.textContent || href;
						return `[${text}](${href})`;
					}
					default:
						return traverseChildren( node );
				}
		}

		return md;
	}

	function traverseChildren( node ) {
		let result = '';
		node.childNodes.forEach( child => {
			result += traverse( child );
		} );
		return result;
	}

	function traverseList( node, marker ) {
		let result = '';
		node.childNodes.forEach( ( child, idx ) => {
			if ( child.tagName && child.tagName.toLowerCase() === 'li' ) {
				let bullet = marker;
				if ( marker === '1.' ) bullet = ( idx + 1 ) + '.';
				result += `${bullet} ${traverseChildren( child )}\n`;
			}
		} );
		return result;
	}

	return traverseChildren( doc.body ).trim();
}
async function loadNotes() {
	await loadMetaOnce();
	noteList.innerHTML = '';

	metaCache.notes
		.filter( m => !m.deleted )
		.sort( ( a, b ) => b.updated - a.updated )
		.forEach( m => {

			const li = document.createElement( 'li' );
			li.style.fontSize = savedSize + 'px'; // ← 一覧に反映
			// 🔹 現在開いているメモに active クラス
			if ( m.id === currentNoteId ) {
				li.classList.add( 'active' );
			}

			/* ========== li 全体を覆う a ========== */
			const link = document.createElement( 'a' );
			link.href = `#/editor/${m.id}`;
			link.className = 'note-link';
			link.style.position = 'absolute';
			link.style.top = '0';
			link.style.left = '0';
			link.style.width = '100%';
			link.style.height = '100%';
			link.style.textDecoration = 'none';
			link.style.color = 'inherit';
			link.style.fontSize = savedSize;
			link.onclick = e => {
				e.preventDefault();
				location.hash = `#/editor/${m.id}`;
				setTimeout( () => {
					closeSidebar();
				}, 100 );
			};
			li.appendChild( link );



			//左側タイトル

			const titleSpan = document.createElement( 'span' );
			titleSpan.className = 'note-title';
			titleSpan.textContent = m.title || 'New Note';
			// titleSpan.style.fontSize = savedSize;
			li.appendChild( titleSpan );

			// 右側（日付 + メニュー）
			const rightDiv = document.createElement( 'div' );
			rightDiv.className = 'note-right';
			const sizeSpan = document.createElement( 'span' );
			sizeSpan.className = 'size-span';
			sizeSpan.textContent = formatSize( m.size || 0 );
			if ( isLargeSize( m.size ) ) {
				sizeSpan.classList.add( 'size-warning' );
			}

			const dateSpan = document.createElement( 'span' );
			dateSpan.className = 'date-span';
			const displayDate = m.pinned ? m.pinnedDate : m.updated;
			dateSpan.textContent = new Date( displayDate ).toLocaleString( 'ja-JP', {
				year: 'numeric', month: '2-digit', day: '2-digit',
				hour: '2-digit', minute: '2-digit'
			} );
			// 🔹 pinned ならマークを追加
			if ( m.pinned ) {
				const pin = document.createElement( 'span' );
				pin.textContent = '』';
				pin.style.marginLeft = '4px';
				dateSpan.appendChild( pin );
			}

			/* ⋯ メニュー */
			const menuBtn = document.createElement( 'button' );
			menuBtn.textContent = '　　⁝';
			menuBtn.className = 'menu-btn';

			const menuPopup = document.createElement( 'div' );
			menuPopup.className = 'menu-popup';
			// 例えば右側の div を親にする場合
			rightDiv.style.position = 'relative'; // 親に relative を付与


			// 📌 ピンボタン
			const pinBtn = document.createElement( 'button' );
			pinBtn.textContent = m.pinned ? '』' : '』';
			pinBtn.onclick = ( e ) => {
				e.stopPropagation();
				menuPopup.style.display = 'none';
				openPinModal( m );
			};
			rightDiv.appendChild( pinBtn );


			const copyBtn = document.createElement( 'button' );
			copyBtn.textContent = '❐';
			copyBtn.onclick = async ( e ) => {
				e.stopPropagation();

				// メモの内容をキャッシュから取得（なければ Firestore 取得）
				let content = noteCache[m.id]?.content;
				if ( !content ) {
					// const snap = await getDoc(doc(db, 'users', `${auth.currentUser.email.split('@')[0]}-${auth.currentUser.uid}`, 'notes', m.id));
					// content = snap.data()?.content || '';
					showToast( '一度メモを開いてください' );
					return;
				}

				// HTML → Markdown に変換
				const markdown = htmlToMarkdown( content );

				// クリップボードにコピー
				try {
					await navigator.clipboard.writeText( markdown );
					showToast( 'Copied as Markdown' );
				} catch ( err ) {
					showToast( 'Failed to copy' );
					console.error( err );
				}

				menuPopup.style.display = 'none';
			};

			const delBtn = document.createElement( 'button' );
			delBtn.textContent = '🗑️';
			delBtn.onclick = async ( e ) => {
				e.stopPropagation();
				m.deleted = true;
				m.updated = Date.now();
				await saveMeta();
				loadNotes();
				showToast( `${m.title || 'New Note'} was Moved to Trash` );
				menuPopup.style.display = 'none';
			};

			menuPopup.append( pinBtn, copyBtn, delBtn );
			menuBtn.onclick = e => {
				e.stopPropagation();

				const isOpen = menuPopup.style.display === 'block';

				closeAllMenus();

				if ( !isOpen ) {
					menuPopup.style.display = 'block';
				}
			};

			rightDiv.append( dateSpan, sizeSpan, menuBtn, menuPopup );
			//aタグの中に右側も入れる
			li.appendChild( rightDiv );
			//li に a を追加
			noteList.appendChild( li );
		} );
	renderTotalSize();
	renderNoteCount();
}

function openPinModal( m ) {
	// container を作る
	const container = document.createElement( 'div' );
	container.className = 'pin-modal-container';
	container.style.zIndex = 10000; // ここを JS で変更すれば overlay も modal も連動

	const overlay = document.createElement( 'div' );
	overlay.className = 'modal-overlay';

	const modal = document.createElement( 'div' );
	modal.className = 'pin-modal';

	const title = document.createElement( 'h2' );
	title.className = 'pin-modal-title';
	title.textContent = m.title || 'New Note';

	const input = document.createElement( 'input' );
	input.className = 'pin-modal-input';
	input.type = 'text';
	input.value = new Date(
		m.pinned ? m.pinnedDate : m.updated
	).toLocaleString( 'ja-JP', {
		year: 'numeric', month: '2-digit', day: '2-digit',
		hour: '2-digit', minute: '2-digit'
	} );

	// ===== buttons =====
	const btns = document.createElement( 'div' );
	btns.className = 'pin-modal-buttons';

	const removeBtn = document.createElement( 'button' );
	removeBtn.className = 'pin-modal-remove';
	removeBtn.textContent = '時刻固定解除';
	removeBtn.style.visibility = m.pinned ? 'visible' : 'hidden';

	const cancelBtn = document.createElement( 'button' );
	cancelBtn.textContent = 'キャンセル';

	const okBtn = document.createElement( 'button' );
	okBtn.textContent = 'OK';

	const pinMassage = document.createElement( 'div' );
	pinMassage.textContent = m.pinned ? '時刻固定 』されています。' : '時刻固定 』しますか？';

	btns.append( removeBtn, cancelBtn, okBtn );
	modal.append( pinMassage, title, input, btns );
	// container に overlay と modal を追加
	container.append( overlay, modal );
	document.body.append( container );
	const close = () => {
		container.remove(); // CSS に合わせる
	};

	cancelBtn.onclick = close;

	okBtn.onclick = async () => {
		const parsed = new Date( input.value.replace( /-/g, '/' ) );
		const time = parsed.getTime();

		if ( isNaN( time ) ) {
			alert( '"yyyy/mm/dd hh:mm" の形式にしてください。' );
			return;
		}

		m.pinned = true;
		m.pinnedDate = time;

		await saveMeta();
		loadNotes();
		close();
	};

	removeBtn.onclick = async () => {
		m.pinned = false;
		delete m.pinnedDate;

		await saveMeta();
		loadNotes();
		close();
	};
	// ===== 伝播完全遮断 =====
	const stop = e => e.stopPropagation();

	modal.addEventListener( 'click', stop );
	modal.addEventListener( 'mousedown', stop );
	modal.addEventListener( 'touchstart', stop );

	input.addEventListener( 'click', stop );
	input.addEventListener( 'mousedown', stop );
	input.addEventListener( 'touchstart', stop );

	btns.addEventListener( 'click', stop );
	btns.addEventListener( 'touchstart', stop );
	// overlayクリックでモーダル閉じる
	['click', 'touchstart', 'mousedown'].forEach(ev => {
    overlay.addEventListener(ev, e => {
        e.stopPropagation();
        e.preventDefault();
        container.remove();
    });
});

}

/* Trash表示 */
function loadTrash() {
	if ( !metaCache || !Array.isArray( metaCache.notes ) ) return;
	trashList.innerHTML = '';

	metaCache.notes
		.filter( m => m.deleted )
		.sort( ( a, b ) => b.updated - a.updated )
		.forEach( m => {
			const li = document.createElement( 'li' );

			/* ========== li 全体を覆う a ========== */
			const link = document.createElement( 'a' );
			link.href = `#/editor/${m.id}`;
			link.style.position = 'absolute';
			link.style.top = '0';
			link.style.left = '0';
			link.style.width = '100%';
			link.style.height = '100%';
			link.style.textDecoration = 'none';
			link.style.color = 'inherit';
			link.onclick = e => {
				e.preventDefault();
				location.hash = `#/editor/${m.id}`;
			};
			li.appendChild( link );

			/* =====================
			 左側タイトル
			 ===================== */

			const titleSpan = document.createElement( 'span' );
			titleSpan.className = 'note-title';
			titleSpan.textContent = m.title || 'New Note';
			li.appendChild( titleSpan );

			// 右側の操作領域
			/* =====================
			 右側（日付 + メニュー）
			 ===================== */
			const rightDiv = document.createElement( 'div' );
			rightDiv.className = 'note-right';
			const sizeSpan = document.createElement( 'span' );
			sizeSpan.className = 'size-span';
			sizeSpan.textContent = formatSize( m.size || 0 );

			const dateSpan = document.createElement( 'span' );
			dateSpan.className = 'date-span';
			dateSpan.textContent =
				new Date( m.updated ).toLocaleString( 'ja-JP', {
					year: 'numeric', month: '2-digit', day: '2-digit',
					hour: '2-digit', minute: '2-digit'
				} );

			// 復元ボタン
			const restoreBtn = document.createElement( 'button' );
			restoreBtn.textContent = '↩️';
			restoreBtn.className = 'menu-btn';
			restoreBtn.onclick = async e => {
				e.stopPropagation();
				await updateMeta( m.id, { deleted: false, updated: Date.now() } );
				loadTrash();
				showToast( `${m.title || 'New Note'} was restored` );
				await loadNotes(); // メモ一覧も更新
			};

			// ⋯ メニュー
			const menuBtn = document.createElement( 'button' );
			menuBtn.textContent = '❌';
			menuBtn.className = 'menu-btn';

			const menuPopup = document.createElement( 'div' );
			menuPopup.className = 'menu-popup';

			// 完全削除ボタン
			const delBtn = document.createElement( 'button' );
			delBtn.textContent = 'Delete Permanently';
			delBtn.onclick = async e => {
				e.stopPropagation();
				// Firestoreのドキュメントを削除
				await deleteDoc( doc( db, 'users', `${auth.currentUser.email.split('@')[0]}-${auth.currentUser.uid}`, 'notes', m.id ) );
				// meta からも削除
				metaCache.notes = metaCache.notes.filter( mm => mm.id !== m.id );
				await saveMeta();
				loadTrash();
				showToast( `${m.title || 'New Note'} was deleted permanently` );
			};

			menuPopup.appendChild( delBtn );
			menuBtn.onclick = e => {
				e.stopPropagation();
				menuPopup.style.display =
					menuPopup.style.display === 'block' ? 'none' : 'block';
			};

			// 右側 div に追加（順序：日付 → 復元 → メニュー）
			rightDiv.append( dateSpan, sizeSpan, restoreBtn, menuBtn, menuPopup );
			li.appendChild( rightDiv );

			trashList.appendChild( li );
		} );
}
//メモidからエディターを開く関数
async function openEditor( id ) {
	noteLoaded = false;
	editor.contentEditable = false;
	currentNoteId = id;
	if ( noteCache[id] ) {
		showEditor( noteCache[id] );
		return;
	}
	const snap = await getDoc( doc( db, 'users', `${auth.currentUser.email.split('@')[0]}-${auth.currentUser.uid}`, 'notes', id ) );
	const data = snap.data();
	noteCache[id] = data;
	localUpdated = data.updated || 0;
	showEditor( data );
}
// dataからhtmlを表示する関数
async function showEditor( data ) {
	editor.contentEditable = false; // まずロード中は false
	// 既存タイトルを本文の1行目に追加
	const content = data.content || '';
	// 改行を <div> に変換してセット
	editor.innerHTML = content
		.split( '\n' )
		.map( line => line || '<div><br></div>' )  // 空行も div に変換
		.join( '' );
	editor.style.fontSize = savedSize + 'px';

	// カーソルを先頭に移動
	const firstLine = editor.firstChild;
	if ( firstLine ) {
		const range = document.createRange();
		const sel = window.getSelection();
		range.selectNodeContents( firstLine );
		range.collapse( true ); // 先頭にセット
		sel.removeAllRanges();
		sel.addRange( range );
	}
	updateTimestamp( currentNoteId );
	show( 'editor' );
	window.scrollTo( 0, 0 );

	// DOM更新完了後に編集可能にする
	requestAnimationFrame( () => {
		noteLoaded = true;
		// editor.contentEditable = true;
	} );
}
// --- タイムスタンプ更新関数 ---
function updateTimestamp( noteId ) {
	const meta = getMeta( noteId );
	if ( !meta ) return;
	const time = new Date( meta.updated );
	timestampEl.textContent = formatDateTime( time );
	timestampEl.classList.add( 'visible' );
}

//5️⃣-2 メモ関連の処理の関数（loadMeta, loadNotes, openEditor, saveNote, updateMeta など）

async function saveNote() {
	if ( !currentNoteId ) return;

	const content = editor.innerHTML;
	const size = new Blob( [content] ).size;
	const updated = Date.now();

	// タイトルを最初の行にする
	const lines = editor.innerText.split( '\n' );
	let title = '';
	for ( const line of lines ) {
		const trimmed = line.trim();
		if ( trimmed ) {
			title = trimmed.slice( 0, 50 );
			break;
		}
	}
	const noteRef = doc( db, 'users', `${auth.currentUser.email.split('@')[0]}-${auth.currentUser.uid}`, 'notes', currentNoteId );
	const snap = await getDoc( noteRef );
	const serverData = snap.exists() ? snap.data() : null;


	// 🔹 競合検知
	if ( serverData && serverData.updated && serverData.updated > localUpdated ) {
		// カスタムモーダル表示
		const choice = await new Promise( resolve => {
			// オーバーレイ
			const overlay = document.createElement( 'div' );
			overlay.style.position = 'fixed';
			overlay.style.inset = '0';
			overlay.style.background = 'rgba(0,0,0,0.45)';
			overlay.style.zIndex = '10000';

			// モーダル本体
			// モーダル本体
			const modal = document.createElement( 'div' );
			modal.style.position = 'fixed';
			modal.style.top = '50%';
			modal.style.left = '50%';
			modal.style.transform = 'translate(-50%, -50%)';
			modal.style.background = '#fff';
			modal.style.padding = '24px 20px';
			modal.style.borderRadius = '12px';
			modal.style.width = '90%';
			modal.style.maxWidth = '420px';
			modal.style.boxShadow = '0 10px 30px rgba(0,0,0,0.25)';
			modal.style.zIndex = '10001';
			modal.style.color = '#000';
			modal.style.textAlign = 'left';

			// タイトル
			const title = document.createElement( 'h3' );
			title.textContent = '⚠ 他の画面で更新されています';
			title.style.margin = '0 0 8px';
			title.style.fontSize = '16px';

			// 説明文
			const msg = document.createElement( 'p' );
			msg.textContent = 'どちらの内容を使いますか？';
			msg.style.margin = '0 0 16px';
			msg.style.fontSize = '14px';
			msg.style.color = '#333';
			const btnLocal = document.createElement( 'button' );
			btnLocal.textContent = `この画面の内容を保存\n（${new Date( localUpdated ).toLocaleString()}時点の内容を編集中）\n→別の画面の内容は消えます。\n`;
			const btnServer = document.createElement( 'button' );
			btnServer.textContent = `別の画面の内容を読み込む\n（${new Date( serverData.updated ).toLocaleString()}保存済み）\n→この画面の内容は消えます。\n`;
			const btnNone = document.createElement( 'button' );
			btnNone.textContent = '\n\n何もしない\n\n\n';
			btnLocal.style.whiteSpace = 'pre-wrap';
			btnServer.style.whiteSpace = 'pre-wrap';
			btnNone.style.whiteSpace = 'pre-wrap';
			function styleButton( btn ) {
				btn.style.display = 'block';
				btn.style.width = '100%';
				btn.style.textAlign = 'left';
				btn.style.padding = '12px 14px';
				btn.style.margin = '8px 0';
				btn.style.borderRadius = '8px';
				btn.style.fontSize = '14px';
				btn.style.cursor = 'pointer';
			}
			styleButton( btnLocal );
			btnLocal.style.border = '2px solid #28a745';
			btnLocal.style.background = '#f6fff8';
			btnLocal.style.color = '#155724';
			btnLocal.innerHTML =
				`<strong>この画面の内容を保存</strong><br>
   <small>${new Date( localUpdated ).toLocaleString()} から編集中</small><br>
   <small>※他の画面の保存内容は消えます</small>`;
			styleButton( btnServer );
			btnServer.style.border = '2px solid #007bff';
			btnServer.style.background = '#f4f9ff';
			btnServer.style.color = '#004085';
			btnServer.innerHTML =
				`<strong>別の画面の内容を読み込む</strong><br>
   <small>${new Date( serverData.updated ).toLocaleString()} に保存済み</small><br>
   <small>※この画面の内容は消えます</small>`;
			styleButton( btnNone );
			btnNone.style.border = '1px solid #ccc';
			btnNone.style.background = '#fff';
			btnNone.style.color = '#555';
			btnNone.innerHTML = `<br><strong>今は何もしない</strong><br>　`;
			btnServer.onclick = () => { resolve( 'server' ); overlay.remove(); modal.remove(); };
			btnLocal.onclick = () => { resolve( 'local' ); overlay.remove(); modal.remove(); };
			btnNone.onclick = () => { resolve( 'none' ); overlay.remove(); modal.remove(); };

			modal.append( title, msg, btnLocal, btnServer, btnNone );
			document.body.append( overlay, modal );
		} );

		if ( choice === 'server' ) {
			// サーバー内容で上書き
			noteCache[currentNoteId] = serverData;
			showEditor( serverData );
			localUpdated = serverData.updated;
			timestampEl.textContent = formatDateTime( new Date( localUpdated ) );
			showToast( "別の画面の内容を読み込みました。" );
			return false;
		} else if ( choice === 'none' ) {
			// 何もしない → 処理終了
			return false;
		}
		// choice === 'local' はここに来る → 下の Firestore 保存処理に進む
	}

	// Firestore 保存（現在内容で上書き）
	await setDoc( noteRef, { content, updated }, { merge: true } );
	localUpdated = updated; // 保存したので端末保持の時刻も更新


	// meta 更新（タイトル・size）
	await updateMeta( currentNoteId, { updated, size, title } );

	// noteCache も同期
	noteCache[currentNoteId] = {
		...( noteCache[currentNoteId] || {} ),
		content,
		updated,
		title,
	};

	// total size 更新
	metaCache.totalSize = metaCache.notes.reduce(
		( sum, m ) => sum + ( m.deleted ? 0 : ( m.size || 0 ) ),
		0
	);

	renderTotalSize();
	return true;
}

async function saveMeta() {
	await setDoc(
		doc( db, 'users', `${auth.currentUser.email.split('@')[0]}-${auth.currentUser.uid}`, 'meta', 'main' ),
		metaCache
	);
}

function getMeta( id ) {
	return metaCache.notes.find( m => m.id === id );
}

async function updateMeta( id, fields ) {
	const m = getMeta( id );
	if ( !m ) return;
	Object.assign( m, fields );
	await saveMeta();
}
async function fixSizesOnce() {
	let fixed = false;
	const notesToCheck = metaCache.notes.filter( m => !m.size || m.size <= 0 );
	if ( notesToCheck.length === 0 ) return;

	// Firestore getDocs でまとめて取得
	const noteRefs = notesToCheck.map( m => doc( db, 'users', `${auth.currentUser.email.split('@')[0]}-${auth.currentUser.uid}`, 'notes', m.id ) );
	const snaps = await Promise.all( noteRefs.map( ref => getDoc( ref ) ) );

	snaps.forEach( ( snap, i ) => {
		if ( !snap.exists() ) return;
		const content = snap.data().content || '';
		notesToCheck[i].size = new Blob( [content] ).size;
		fixed = true;
	} );

	if ( fixed ) {
		metaCache.totalSize = metaCache.notes.reduce(
			( sum, m ) => sum + ( m.deleted ? 0 : ( m.size || 0 ) ),
			0
		);
		await saveMeta();
		renderTotalSize();
	}
}

function formatSize( bytes = 0 ) {
	const kb = Math.max( 0, Math.floor( bytes / 1024 ) );

	if ( kb <= 10 ) {
		// 10KB以下は文字数で表示（1文字=1バイト換算）
		return bytes + ' bytes';
	}

	if ( kb >= 1024 ) {
		return ( kb / 1024 ).toFixed( 2 ) + ' MB';
	}

	return kb + ' KB';
}
function isLargeSize( bytes = 0 ) {
	return bytes >= 700 * 1024;
}


//6️⃣ エディターイベント（入力、貼り付け、キーボード操作）

editor.addEventListener( 'input', () => {
	if ( !currentNoteId ) return;
	const meta = getMeta( currentNoteId ); // ← ここで取得
	if ( !meta ) return; // もし存在しなければ中断
	// 入力中は "..." を表示
	saveStatus.style.color = '#999';
	saveStatus.textContent = '...';
	timestampEl.classList.add( 'visible' );

	// debounce 保存
	clearTimeout( saveTimer );
	saveTimer = setTimeout( async () => {

		const saved = await saveNote();
		if ( !saved ) return;
		if ( meta ) {
			await updateMeta( currentNoteId, {
				title: meta.title,
				updated: localUpdated,
				size: meta.size
			} );
		}

		// 保存完了 → 緑の ✔️ 表示
		saveStatus.textContent = '●';
		saveStatus.style.color = '#4caf50';
		// 前回のタイマーがあればクリア
		if ( hideStatusTimer ) clearTimeout( hideStatusTimer );
		// 5秒後に消す
		hideStatusTimer = setTimeout( () => {
			saveStatus.textContent = '';
		}, 5000 );
		timestampEl.textContent = formatDateTime( new Date( meta.updated ) );
	}, 1000 );
} );

// ===== Italic → h2 変換、アンダーライン→取消線 =====
editor.addEventListener( 'beforeinput', e => {
	if ( e.inputType === 'formatItalic' ) {
		e.preventDefault();

		// 選択範囲 or カーソル位置を h2 に
		document.execCommand( 'formatBlock', false, 'h2' );

		// 念のため i / em が残ってたら剥がす
		editor.querySelectorAll( 'i, em' ).forEach( el => {
			el.replaceWith( ...el.childNodes );
		} );

		// 保存トリガー
		editor.dispatchEvent( new Event( 'input', { bubbles: true } ) );
	}

	if ( e.inputType === 'formatUnderline' ) {
		e.preventDefault(); // デフォルトの下線を止める

		// 選択範囲に <s> を適用
		document.execCommand( 'strikeThrough' );

		// 念のため i / em / u が残ってたら剥がす
		editor.querySelectorAll( 'i, em, u' ).forEach( el => {
			el.replaceWith( ...el.childNodes );
		} );

		// 保存トリガー
		editor.dispatchEvent( new Event( 'input', { bubbles: true } ) );
	}
} );

editor.addEventListener( 'keydown', e => {
	const sel = document.getSelection();
	if ( !sel.rangeCount ) return;

	// カーソル直前のテキストを取得
	const range = sel.getRangeAt( 0 );
	const node = range.startContainer;
	const offset = range.startOffset;

	if ( node.nodeType === 3 ) { // テキストノード
		const text = node.textContent;
		// ^_^ が直前にあるか？
		if ( text.slice( offset - 3, offset ) === '^_^' ) {
			e.preventDefault();

			// ^_^ を削除
			node.deleteData( offset - 3, 3 );

			// 選択範囲を h2 に
			document.execCommand( 'formatBlock', false, 'h2' );

			// 念のため i/em を剥がす
			editor.querySelectorAll( 'i, em' ).forEach( el => el.replaceWith( ...el.childNodes ) );

			// 保存トリガー
			editor.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		}
	}

	// Windows: Ctrl+I / Mac: Cmd+I
	if ( ( e.ctrlKey || e.metaKey ) && e.key.toLowerCase() === 'i' ) {
		e.preventDefault(); // ブラウザのデフォルト動作を止める
		document.execCommand( 'italic' ); // 選択中をイタリックに
	}
} );

/* Paste処理（画像・埋め込み・テキスト対応 完全版） */

const pasteConfig = {
	enableUrlLink: true,
	enableEmbed: true
};

/* ===== Range utilities ====== */
function getCurrentRange() {
	const sel = document.getSelection();
	if ( !sel || !sel.rangeCount ) return null;
	return sel.getRangeAt( 0 );
}

function replaceRangeWithNodes( editor, range, nodes ) {
	range.deleteContents();
	for ( const node of nodes ) {
		range.insertNode( node );
		range.setStartAfter( node );
	}
	range.collapse( true );
	editor.dispatchEvent( new Event( 'input', { bubbles: true } ) );
}

/* ===== URL utilities ====== */
const URL_REGEX = /(https?:\/\/[^\s]+)/g;
const IMAGE_URL_REGEX = /\.(png|jpe?g|gif|webp)(\?.*)?$/i;

function splitTextByUrl( text ) {
	const parts = [];
	let last = 0;
	for ( const m of text.matchAll( URL_REGEX ) ) {
		if ( m.index > last ) {
			parts.push( { type: 'text', value: text.slice( last, m.index ) } );
		}
		parts.push( { type: 'url', value: m[0] } );
		last = m.index + m[0].length;
	}
	if ( last < text.length ) {
		parts.push( { type: 'text', value: text.slice( last ) } );
	}
	return parts;
}

function isSingleUrlLine( line ) {
	return /^https?:\/\/[^\s]+$/.test( line.trim() );
}

/* ===== Embed handlers ====== */
const embedHandlers = [
	// YouTube
	{
		match: url =>
			url.match( /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]+)/i ),
		create: ( m, url ) => {
			const wrap = document.createElement( 'div' );
			wrap.className = 'video'; // CSSの幅とpadding-topを使う
			const iframe = document.createElement( 'iframe' );
			iframe.src = `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0&playsinline=1`;
			iframe.allowFullscreen = true;
			wrap.appendChild( iframe );
			wrap.dataset.url = url;
			return wrap;
		}
	},

	// X / Twitter
	{
		match: url =>
			url.match( /(?:twitter\.com|x\.com)\/[\w@]+\/status\/\d+/i ),
		create: ( m, url ) => {
			const wrap = document.createElement( 'div' );
			wrap.className = 'twitter';
			const blockquote = document.createElement( 'blockquote' );
			blockquote.className = 'twitter-tweet';
			const a = document.createElement( 'a' );
			a.href = url.replace( /^https?:\/\/x\.com/i, 'https://twitter.com' );
			blockquote.appendChild( a );
			wrap.appendChild( blockquote );
			wrap.dataset.url = url;
			if ( window.twttr?.widgets ) window.twttr.widgets.load( wrap );
			return wrap;
		}
	},

	// Instagram
	{
		match: url =>
			url.match( /instagram\.com\/(p|reel)\/([\w-]+)/i ),
		create: ( m, url ) => {
			const wrap = document.createElement( 'div' );
			wrap.className = 'instagram';
			const blockquote = document.createElement( 'blockquote' );
			blockquote.className = 'instagram-media';
			blockquote.setAttribute( 'data-instgrm-permalink', url );
			blockquote.setAttribute( 'data-instgrm-version', '14' );
			wrap.appendChild( blockquote );
			wrap.dataset.url = url;
			// 少し遅延して処理する
			setTimeout( () => {
				if ( window.instgrm?.Embeds?.process ) window.instgrm.Embeds.process( wrap );
			}, 50 );
			return wrap;
		}
	},

	// TikTok
	{
		match: url =>
			url.match( /tiktok\.com\/.*\/video\/(\d+)/i ),
		create: ( m, url ) => {
			const wrap = document.createElement( 'div' );
			wrap.className = 'tiktok';
			const iframe = document.createElement( 'iframe' );
			iframe.src = `https://www.tiktok.com/embed/${m[1]}`;
			iframe.allow = 'autoplay; fullscreen';
			iframe.allowFullscreen = true;
			wrap.appendChild( iframe );
			wrap.dataset.url = url;
			return wrap;
		}
	},

	// ニコニコ動画
	{
		match: url =>
			url.match( /nicovideo\.jp\/watch\/([\w]+)/i ),
		create: ( m, url ) => {
			const wrap = document.createElement( 'div' );
			wrap.className = 'video';
			const iframe = document.createElement( 'iframe' );
			iframe.src = `https://embed.nicovideo.jp/watch/${m[1]}`;
			iframe.setAttribute( 'frameborder', '0' );
			iframe.setAttribute( 'allowfullscreen', '' );
			wrap.appendChild( iframe );
			wrap.dataset.url = url;
			return wrap;
		}
	}
];

/* ===== Image paste (single image) ====== */
async function handleSingleImagePaste( file, editor, range ) {
	const originalSizeBytes = file.size;

	// 元画像読み込み
	const img = new Image();
	const blobUrl = URL.createObjectURL( file );
	img.src = blobUrl;
	await img.decode();

	// 最大幅1024pxにリサイズ
	const MAX_WIDTH = 1024;
	let w = img.width;
	let h = img.height;
	if ( w > MAX_WIDTH ) {
		h = Math.round( h * ( MAX_WIDTH / w ) );
		w = MAX_WIDTH;
	}

	const canvas = document.createElement( 'canvas' );
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext( '2d' );
	ctx.drawImage( img, 0, 0, w, h );

	// JPEG圧縮 + 最大容量保証
	const MAX_BYTES = 100000; // 例: 100KB
	const BASE64_EXPAND = 1.37;
	const MAX_BLOB_BYTES = MAX_BYTES / BASE64_EXPAND;

	let quality = 0.8;
	let scale = 1.0;
	let loopCount = 0;

	const originalWidth = canvas.width;
	const originalHeight = canvas.height;

	let safeBlob = await new Promise( resolve => canvas.toBlob( resolve, 'image/jpeg', quality ) );

	while ( safeBlob.size > MAX_BLOB_BYTES && ( quality > 0.1 || scale > 0.1 ) ) {
		loopCount++;
		if ( quality > 0.1 ) {
			quality -= 0.05;
			safeBlob = await new Promise( resolve => canvas.toBlob( resolve, 'image/jpeg', quality ) );
		} else {
			scale *= 0.9;
			const tmpCanvas = document.createElement( 'canvas' );
			tmpCanvas.width = Math.floor( originalWidth * scale );
			tmpCanvas.height = Math.floor( originalHeight * scale );
			const tmpCtx = tmpCanvas.getContext( '2d' );
			tmpCtx.drawImage( canvas, 0, 0, tmpCanvas.width, tmpCanvas.height );
			safeBlob = await new Promise( resolve => tmpCanvas.toBlob( resolve, 'image/jpeg', quality ) );
		}
	}

	// base64 に変換して挿入
	const reader = new FileReader();
	reader.onloadend = () => {
		const base64 = reader.result;

		// showToastなどでサイズ表示
		if ( typeof showToast === 'function' ) {
			const formatSize = bytes => bytes >= 1024 * 1024
				? ( bytes / ( 1024 * 1024 ) ).toFixed( 1 ) + ' MB'
				: Math.round( bytes / 1024 ) + ' KB';
			showToast( `Saved: ${formatSize( base64.length )} (Original: ${formatSize( originalSizeBytes )}) | JPEG loops: ${loopCount}` );
		}

		// <img> に挿入
		const imgEl = document.createElement( 'img' );
		imgEl.src = base64;
		range.insertNode( imgEl );

		// カーソルを画像の後ろに移動
		const br = document.createElement( 'br' );
		range.setStartAfter( imgEl );
		range.insertNode( br );
		range.setStartAfter( br );
		range.collapse( true );

		editor.dispatchEvent( new Event( 'input', { bubbles: true } ) );
	};
	reader.readAsDataURL( safeBlob );
}

/* ===== paste handler ====== */
editor.addEventListener( 'paste', async e => {
	const items = e.clipboardData?.items || [];
	const text = e.clipboardData?.getData( 'text/plain' ) || '';
	const range = getCurrentRange();
	if ( !range ) return;

	/* ---- image only ---- */
	const imageItems = [...items].filter( i => i.type.startsWith( 'image/' ) );
	if ( imageItems.length === 1 && items.length === 1 ) {
		e.preventDefault();
		const file = imageItems[0].getAsFile();
		if ( file ) await handleSingleImagePaste( file, editor, range );
		return;
	}

	e.preventDefault();

	const lines = text.replace( /\r\n/g, '\n' ).split( '\n' );
	const nodes = [];

	for ( const line of lines ) {
		const trimmed = line.trim();

		/* ---- URL単体行 ---- */
		if ( pasteConfig.enableEmbed && isSingleUrlLine( trimmed ) ) {
			let embedded = false;

			// SNS embed
			for ( const h of embedHandlers ) {
				const m = h.match( trimmed );
				if ( m ) {
					nodes.push( h.create( m, trimmed ) );
					nodes.push( document.createElement( 'br' ) );
					embedded = true;
					break;
				}
			}

			if ( embedded ) continue;

			// 画像URL
			if ( IMAGE_URL_REGEX.test( trimmed ) ) {
				const a = document.createElement( 'a' );
				a.href = trimmed;
				a.target = '_blank';
				a.dataset.url = trimmed;
				const img = document.createElement( 'img' );
				img.src = trimmed;
				a.appendChild( img );
				nodes.push( a, document.createElement( 'br' ) );
				continue;
			}

			// 通常URL
			if ( pasteConfig.enableUrlLink ) {
				const a = document.createElement( 'a' );
				a.href = trimmed;
				a.textContent = trimmed;
				a.target = '_blank';
				a.dataset.url = trimmed;
				nodes.push( a, document.createElement( 'br' ) );
				continue;
			}
		}

		/* ---- 文中URL ---- */
		if ( pasteConfig.enableUrlLink && URL_REGEX.test( line ) ) {
			const parts = splitTextByUrl( line );
			for ( const p of parts ) {
				if ( p.type === 'text' ) {
					nodes.push( document.createTextNode( p.value ) );
				} else {
					const a = document.createElement( 'a' );
					a.href = p.value;
					a.textContent = p.value;
					a.target = '_blank';
					a.dataset.url = p.value;
					nodes.push( a );
				}
			}
			nodes.push( document.createElement( 'br' ) );
			continue;
		}

		/* ---- 純テキスト ---- */
		nodes.push( document.createTextNode( line ) );
		nodes.push( document.createElement( 'br' ) );
	}

	// 最後の br を除去
	if ( nodes.at( -1 )?.nodeName === 'BR' ) nodes.pop();

	if ( nodes.length ) {
		replaceRangeWithNodes( editor, range, nodes );
	}
} );

editor.addEventListener( 'copy', e => {
	const sel = document.getSelection();
	if ( !sel || sel.isCollapsed ) return;

	const fragment = sel.getRangeAt( 0 ).cloneContents();
	const tempDiv = document.createElement( 'div' );
	tempDiv.appendChild( fragment );

	function getPlainText( node ) {
		if ( node.nodeType === Node.TEXT_NODE ) return node.textContent;
		if ( node.nodeType !== Node.ELEMENT_NODE ) return '';

		// dataset.url を持つ最上位の親を探す
		const urlAncestor = node.closest( '[data-url]' );
		if ( urlAncestor ) {
			// base64画像はそのままコピー
			if ( urlAncestor.tagName === 'IMG' && urlAncestor.src.startsWith( 'data:' ) ) {
				return urlAncestor.outerHTML;
			}
			return urlAncestor.dataset.url;
		}

		// br は改行に変換
		if ( node.tagName === 'BR' ) return '\n';

		// blockquote や div も改行で区切る
		const childrenText = Array.from( node.childNodes ).map( getPlainText ).join( '' );
		if ( ['DIV', 'P', 'BLOCKQUOTE'].includes( node.tagName ) ) return childrenText + '\n';
		return childrenText;
	}

	let plainText = getPlainText( tempDiv );

	// 最後の余分な改行を削除
	plainText = plainText.replace( /\n+$/g, '' );

	e.preventDefault();
	e.clipboardData.setData( 'text/plain', plainText );
} );
//モバイルではtouchstart,touchend,mousedown,mouseup,click,blurの順に起こる
//PCではmousedown,mouseup,click,blurの順に起こる
editor.addEventListener( 'touchstart', e => {
	isTouchDevice = true;
	if ( !noteLoaded ) {
		e.preventDefault();  // ロード前は一切操作させない
		return;
	}
	lastTouch = e.touches[0];   // ← ★この1行を追加
	longPress = false;

	// リンク・画像・埋め込み上は長押し候補
	if (
		e.target.closest( 'a' ) ||
		e.target.closest( 'img' ) ||
		e.target.closest( 'iframe' ) ||
		e.target.closest( '.video' ) ||
		e.target.closest( '.twitter' ) ||
		e.target.closest( '.instagram' )
	) {
		longPress = true;
	}
} );

editor.addEventListener( 'touchend', () => {
	// 🔒 リンクプレビュー後は何もしない
	if ( longPress ) return;
	if ( !noteLoaded ) return;      // ← ロード完了前は無視
	if ( editor.contentEditable === 'true' ) return;

	if ( requireDoubleTap ) {
		const now = Date.now();
		if ( now - lastTapTime < 300 ) {
			enableEdit();
		}
		lastTapTime = now;
		return;
	}

	enableEdit();
} );

function enableEdit() {
	if ( noteLoaded !== true ) return; // ← ロード前は編集不可
	// まず editable にする
	editor.contentEditable = 'true';
	requireDoubleTap = false;

	// iOS / Android 対策：1フレーム遅らせる
	requestAnimationFrame( () => {
		if ( lastTouch ) {
			const range = document.caretRangeFromPoint(
				lastTouch.clientX,
				lastTouch.clientY
			);
			if ( range ) {
				const sel = window.getSelection();
				sel.removeAllRanges();
				sel.addRange( range );
			}
		}

		editor.focus( { preventScroll: true } );
	} );
}

// PC: クリックで編集開始: mousedown自体はモバイルでも起こるが、先にtouchstartが発火するのでそれによるisTouchDevice = true;で防ぐ
editor.addEventListener( 'mousedown', e => {
	if ( isTouchDevice ) return;
	// 長押しやリンククリックは除外
	if ( e.target.closest( 'a' ) || e.target.closest( 'img' ) || e.target.closest( 'iframe' ) ) return;
	if ( !noteLoaded ) {
		// ロード中なら絶対に編集不可
		e.preventDefault();
		e.stopPropagation();
		return;
	}

	// 右クリック無視
	if ( e.button !== 0 ) return;

	// すでに編集可能なら何もしない
	if ( editor.contentEditable === 'true' ) return;

	requireDoubleTap = false; // PCは常にシングル扱い
	editor.contentEditable = 'true';
	editor.focus();
} );
//PCモバイル共通
editor.addEventListener( 'click', e => {
	const a = e.target.closest( 'a' );
	if ( !a ) return;

	// 編集中だけJS制御
	if ( editor.contentEditable === 'true' ) {
		e.preventDefault();
		return;
	}

} );
//settimeoutはモバイル用の安全策、カーソルがなくなった時の挙動
editor.addEventListener( 'blur', () => {
	setTimeout( () => {
		editor.contentEditable = 'false';
	}, 0 );
} );
editor.addEventListener( 'keydown', ( e ) => {
	// Undo (Cmd/Ctrl + Z)
	if ( ( e.metaKey || e.ctrlKey ) && !e.shiftKey && e.key.toLowerCase() === 'z' ) {
		e.preventDefault();
		// @ts-ignore
		document.execCommand( 'undo' );
		return;
	}

	// Redo (Cmd/Ctrl + Shift + Z)
	if ( ( e.metaKey || e.ctrlKey ) && e.shiftKey && e.key.toLowerCase() === 'z' ) {
		e.preventDefault();
		// @ts-ignore
		document.execCommand( 'redo' );
		return;
	}

	// Delete/Backspaceで元URLに戻す
	if ( e.key !== 'Delete' && e.key !== 'Backspace' ) return;

	const sel = document.getSelection();
	if ( !sel.rangeCount ) return;
	const range = sel.getRangeAt( 0 );
	// 範囲選択なら完全にデフォルトに任せる
	if ( !range.collapsed ) return;

	// テキストノードなら親をチェック
	let node = range.startContainer;
	if ( node.nodeType === 3 ) node = node.parentNode;

	// imgや埋め込みdivを上にたどる
	while ( node && !node.dataset?.url ) node = node.parentNode;
	if ( !node?.dataset?.url ) return;

	e.preventDefault();
	// 元URLに置き換え
	const urlText = document.createTextNode( node.dataset.url );
	node.replaceWith( urlText );
	const newRange = document.createRange();
	newRange.selectNodeContents( urlText );

	sel.removeAllRanges();
	sel.addRange( newRange );

	// focus を明示的にセット（iOS 対応）
	editor.focus();

	// 改行追加（range 選択後に置く）
	// const br = document.createElement( 'br' );
	// urlText.after( br );

	editor.dispatchEvent( new Event( 'input', { bubbles: true } ) );
} );

/* 7️⃣ ナビゲーション・新規作成ボタン*/
document.getElementById( 'go-trash' ).onclick = () => { location.hash = '#/trash'; closeSidebar(); }
document.getElementById( 'go-list' ).onclick = () => { location.hash = '#/list'; closeSidebar(); }

/* New note button */
document.getElementById( 'new-note' ).onclick = async () => {
	requireDoubleTap = false;
	await loadMetaOnce(); // ← 必ず先に呼ぶ
	// 本文ドキュメントを1件だけ作る
	const ref = await addDoc(
		collection( db, 'users', `${auth.currentUser.email.split('@')[0]}-${auth.currentUser.uid}`, 'notes' ),
		{ title: '', content: '', updated: Date.now() }
	);

	// meta（目次箱）に追加
	metaCache.notes.push( {
		id: ref.id,
		title: '',
		updated: Date.now(),
		deleted: false
	} );

	// meta保存
	await setDoc(
		doc( db, 'users', `${auth.currentUser.email.split('@')[0]}-${auth.currentUser.uid}`, 'meta', 'main' ),
		metaCache
	);

	// エディタへ
	location.hash = `#/editor/${ref.id}`;
	closeSidebar();
};
document.getElementById( 'new-note-2' ).onclick =
	document.getElementById( 'new-note' ).onclick;
/* Navigation */
async function navigate() {
	if ( !auth.currentUser ) {
		show( 'login' );
		return;
	}

	const hash = location.hash;

	if ( hash.startsWith( '#/editor/' ) ) {
		await loadMetaOnce();           // editor だけ
		const id = hash.split( '/' )[2];
		if ( id ) await openEditor( id );

	} else if ( hash === '#/trash' ) {
		await loadMetaOnce();           // trash だけ
		show( 'trash' );
		loadTrash();

		// ★ Empty Trash ボタンの設定 ★
		const emptyTrashBtn = document.getElementById( 'empty-trash-btn' );
		if ( emptyTrashBtn ) {
			emptyTrashBtn.onclick = async () => {
				if ( !metaCache || !Array.isArray( metaCache.notes ) ) return;

				// ★ 確認ダイアログ ★
				const ok = confirm( "Trash内のすべてのメモを完全削除します。本当によろしいですか？" );
				if ( !ok ) return; // キャンセルなら何もしない

				const trashNotes = metaCache.notes.filter( m => m.deleted );
				for ( const m of trashNotes ) {
					// 完全削除
					await deleteDoc( doc( db, 'users', `${auth.currentUser.email.split('@')[0]}-${auth.currentUser.uid}`, 'notes', m.id ) );
				}


				// meta からも削除
				metaCache.notes = metaCache.notes.filter( m => !m.deleted );
				await saveMeta();

				loadTrash();
				showToast( 'Trash emptied' );
			};
		}

	} else {
		await loadMetaOnce();           // list だけ
		show( 'list' );
		await loadNotes();
	}
}