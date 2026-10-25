/*
 *  Copyright 2026 The InfiniFlow Authors. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * Adapted for GBAP GBAP from RAGFlow v0.27.2
 * upstream commit: a024bea0cd93f39e6652a42bf84dd20c55bc560b
 * upstream source: web/src/components/document-preview/md/index.tsx
 *
 * GBAP modification: renders already-authorized canonical source text.
 */
import ReactMarkdown from 'react-markdown';

type Props = { text: string };

export function RagflowMarkdownPreview({ text }: Props) {
  return (
    <article className="knowledge-markdown-preview">
      <ReactMarkdown components={{ img: ({ alt }) => <span className="knowledge-markdown-image-note">[图片：{alt || '未命名'}]</span>, a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>{text}</ReactMarkdown>
    </article>
  );
}
