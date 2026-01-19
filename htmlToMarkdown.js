export function htmlToMarkdown( html ) {
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
					case 'div': {
						// embed wrapper
						if ( node.dataset?.url ) {
							const url = node.dataset.url;
							return `[${url}](${url})\n\n`;
						}
						return traverseChildren( node ) + '\n';
					}
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