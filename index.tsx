// FIX: Import React to resolve 'React' is not defined error.
import React from 'react';
// FIX: Import ReactDOM to resolve 'ReactDOM' is not defined error.
import ReactDOM from 'react-dom/client';
// FIX: Import html2pdf to resolve 'html2pdf' is not defined error.
import html2pdf from 'html2pdf.js';
import { GoogleGenAI, Type } from "@google/genai";

const { useState, useRef, useEffect, useMemo } = React;

// Helper to convert File to Base64
const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = error => reject(error);
    });

// Utility to add a delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// FIX: Add types for component props.
interface DropZoneProps {
    onFileDrop: (file: File) => void;
    file: File | null;
    title: string;
    disabled?: boolean;
}

const DropZone: React.FC<DropZoneProps> = ({ onFileDrop, file, title, disabled = false }) => {
    const [isDragOver, setIsDragOver] = useState(false);
    // FIX: Type useRef for input element.
    const inputRef = useRef<HTMLInputElement>(null);

    // FIX: Add type to event object to resolve TS errors.
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (!disabled) setIsDragOver(true);
    };

    // FIX: Add type to event object to resolve TS errors.
    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);
    };

    // FIX: Add type to event object to resolve TS errors.
    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (disabled) return;
        setIsDragOver(false);
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            onFileDrop(files[0]);
        }
    };
    
    // FIX: Add type to event object to resolve TS errors.
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            onFileDrop(files[0]);
        }
    };

    const handleClick = () => {
        if (!disabled && inputRef.current) {
            inputRef.current.click();
        }
    };

    const fileURL = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

    useEffect(() => {
        return () => {
            if (fileURL) {
                URL.revokeObjectURL(fileURL);
            }
        };
    }, [fileURL]);


    return (
        <div className="upload-section">
            <h3>{title}</h3>
            <div
                className={`drop-zone ${isDragOver ? 'drag-over' : ''} ${disabled ? 'disabled' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleClick}
            >
                <input type="file" ref={inputRef} onChange={handleFileChange} accept=".pdf,image/*" style={{display: 'none'}} disabled={disabled} />
                <p>{file ? `${file.name} (클릭하여 변경)` : <><span className="browse-link">파일을 선택</span>하거나 여기에 드래그하세요.</>}</p>
            </div>
            {file && (
                 <div className="file-preview">
                    {file.type === 'application/pdf' ? (
                        <embed src={fileURL || ''} type="application/pdf" width="100%" height="400px" />
                    ) : (
                        <img src={fileURL || ''} alt="preview" className="image-preview" />
                    )}
                 </div>
            )}
        </div>
    );
};

// FIX: Define types for structured question data from AI.
interface Choice {
    text: string;
}

interface VocabularyItem {
    word: string;
    meaning: string;
}

interface QuestionData {
    questionNumber: string;
    prompt: string;
    promptEnglishPart?: string; // For Q21 prompt underline
    passage?: string;
    starredVocabulary?: string; // For vocab under the passage
    underlinedText?: string;
    choices?: Choice[];
    boxedText?: string;
    mainTextAfterBox?: string;
    summaryPrompt?: string;
    summaryBoxText?: string;
    answer: string;
    translation: string;
    vocabulary: VocabularyItem[];
}


// FIX: Add types for component props.
interface FormattedQuestionProps {
    data: QuestionData;
}

const FormattedQuestion: React.FC<FormattedQuestionProps> = ({ data }) => {
    const renderPrompt = () => {
        let content: (string | JSX.Element)[] = [data.prompt];

        // Q21 English underline
        if (data.questionNumber === '21' && data.promptEnglishPart) {
            content = content.flatMap(segment =>
                typeof segment === 'string' && segment.includes(data.promptEnglishPart)
                    ? segment.split(data.promptEnglishPart).flatMap((part, i, arr) =>
                        i < arr.length - 1 ? [part, <u key={`en-${i}`}>{data.promptEnglishPart}</u>] : [part]
                    )
                    : [segment]
            );
        }

        // '틀린', '않는' underline
        const keywords = ['틀린', '않는'];
        keywords.forEach(keyword => {
            content = content.flatMap(segment =>
                typeof segment === 'string' && segment.includes(keyword)
                    ? segment.split(keyword).flatMap((part, i, arr) =>
                        i < arr.length - 1 ? [part, <u key={`${keyword}-${i}`}>{keyword}</u>] : [part]
                    )
                    : [segment]
            );
        });

        return <p className="question-prompt">{content}</p>;
    };

    const renderPassage = () => {
        if (!data.passage) return null;
    
        let passageToRender: any = data.passage;
    
        // Q33: Fix blank spacing by replacing a regular space before a long underscore with a non-breaking space.
        if (data.questionNumber === '33') {
            passageToRender = passageToRender.replace(/\s(_{5,})/g, '\u00A0$1');
        }
    
        // Q29/30: Underline based on __UW__ markers
        if (passageToRender.includes('__UW__')) {
            const parts = passageToRender.split('__UW__');
            passageToRender = parts.map((part: string, index: number) =>
                index % 2 === 1 ? <u key={index}>{part}</u> : part
            );
        }
        // Q21: Underline based on specific text (fallback if markers aren't used)
        else if (data.underlinedText && typeof passageToRender === 'string' && passageToRender.includes(data.underlinedText)) {
            const parts = passageToRender.split(data.underlinedText);
            passageToRender = (
                <>
                    {parts[0]}<u>{data.underlinedText}</u>{parts[1]}
                </>
            );
        }
    
        return <div className="question-passage">{passageToRender}</div>;
    };
    

    const renderStarredVocabulary = () => {
        if (!data.starredVocabulary) return null;
        return <pre className="starred-vocabulary">{data.starredVocabulary}</pre>;
    };
    
    const renderMainTextAfterBox = () => {
        if (!data.mainTextAfterBox) return null;

        if (data.questionNumber === '36' || data.questionNumber === '37') {
            // Split by (A), (B), (C) to create separate paragraphs with hanging indents
            const parts = data.mainTextAfterBox.split(/(\([A-C]\))/).filter(part => part.trim() !== '');
            const paragraphs = [];
            for (let i = 0; i < parts.length; i += 2) {
                if (parts[i+1]) {
                    // Combine marker (e.g., "(A)") and the text that follows
                    paragraphs.push(
                        <p key={i} className="sequence-paragraph">
                           {parts[i]}{parts[i+1]}
                        </p>
                    );
                } else {
                     // Handle cases where a marker might not be followed by text
                     paragraphs.push(<p key={i} className="sequence-paragraph">{parts[i]}</p>);
                }
            }
            return <div className="question-after-box">{paragraphs}</div>;
        }

        return <div className="question-after-box">{data.mainTextAfterBox}</div>;
    };

    const renderChoices = () => {
        if (!data.choices || ['29', '30', '35', '38', '39'].includes(data.questionNumber)) {
            return null;
        }
        const choiceMarkers = ['①', '②', '③', '④', '⑤'];

        const choicesClassName = `question-choices ${
            (data.questionNumber === '36' || data.questionNumber === '37') ? 'choices-layout-36-37' : ''
        }`;

        return (
            <>
                {data.questionNumber === '40' && (
                    <div className="choice-header-40">
                        <span>(A)</span>
                        <span>(B)</span>
                    </div>
                )}
                <ul className={choicesClassName}>
                    {data.choices.map((choice, index) => {
                         if (data.questionNumber === '40') {
                            const parts = choice.text.split(/\s*\.{2,}\s*|\s{2,}/);
                            const partA = parts[0] || '';
                            const partB = parts[1] || '';
                            return (
                                <li key={index} className="choice-item-40">
                                    <span className="choice-marker">{choiceMarkers[index]}</span>
                                    <span className="choice-part-a">{partA}</span>
                                    <span className="choice-dots"></span>
                                    <span className="choice-part-b">{partB}</span>
                                </li>
                            );
                        }
                        // Default: Render with choice marker
                        return <li key={index}>{choiceMarkers[index]} {choice.text}</li>;
                    })}
                </ul>
            </>
        );
    };

    return (
        <div className="question-text-container">
            {renderPrompt()}
            {data.boxedText && <div className="boxed-text">{data.boxedText}</div>}
            
            {/* Conditional rendering for Q36/37 vocab placement */}
            {['36', '37'].includes(data.questionNumber) ? (
                <>
                    {renderPassage()}
                    {renderMainTextAfterBox()}
                    {renderStarredVocabulary()}
                </>
            ) : (
                <>
                    {renderPassage()}
                    {renderStarredVocabulary()}
                    {renderMainTextAfterBox()}
                </>
            )}

            {data.summaryPrompt && <p className="summary-prompt">{data.summaryPrompt}</p>}
            {data.summaryBoxText && (
                <div className="boxed-text summary-box">
                    {data.summaryBoxText.split(/(\(A\)|\(B\))/g).map((part, index) => 
                        (part === '(A)' || part === '(B)') ? <span key={index} className="summary-blank">{part}</span> : part
                    )}
                </div>
            )}
            {renderChoices()}
        </div>
    );
};


// FIX: Add types for component props.
interface AnalysisSheetProps {
    title: string;
    questionData: QuestionData;
    logoFile: File | null;
}

const AnalysisSheet: React.FC<AnalysisSheetProps> = ({ title, questionData, logoFile }) => {
    const logoUrl = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : null), [logoFile]);
    const displayTitle = title.replace('문제지', '해설지');
    
    useEffect(() => {
        return () => {
            if (logoUrl) {
                URL.revokeObjectURL(logoUrl);
            }
        };
    }, [logoUrl]);

    return (
        <div className="analysis-sheet">
            <div className="preview-header">
                <span className="title">{displayTitle}</span>
                <span className="info">학번 ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ) 이름 ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</span>
            </div>
            <div className="preview-body">
                <div className="question-main-content">
                    <div className="question-content">
                         <h2 className="question-number">{questionData.questionNumber}</h2>
                        <FormattedQuestion data={questionData} />
                    </div>
                </div>
                <div className="analysis-content">
                    <h3>해석</h3>
                    <div className="explanation-block">{questionData.translation}</div>
                    <p className="answer-text">정답: {questionData.answer}</p>
                    <div className="vocabulary-block">
                        <h4>어휘 및 어구</h4>
                        <ul>
                            {questionData.vocabulary.map((item, index) => (
                                <li key={index}>{item.word} - {item.meaning}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
            <div className="preview-footer">
                {logoUrl && <img src={logoUrl} alt="logo" className="logo-placeholder" />}
            </div>
        </div>
    );
};

const App = () => {
    const [examFile, setExamFile] = useState<File | null>(null);
    const [solutionFile, setSolutionFile] = useState<File | null>(null);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessed, setIsProcessed] = useState(false);
    const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
    const [analysisData, setAnalysisData] = useState<{[key: string]: QuestionData} | null>(null);
    const [examTitle, setExamTitle] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loadingMessage, setLoadingMessage] = useState('파일을 분석 중입니다... (최대 1분 소요)');
    // FIX: type useRef for preview element.
    const previewRef = useRef<HTMLDivElement>(null);
    const isCancelledRef = useRef(false);
    
    const allowedQuestions = useMemo(() => ['18', '19', '20', '21', '22', '23', '24', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40'], []);

    const generateAnalysis = async (examFile: File, solutionFile: File | null) => {
        if (!process.env.API_KEY) {
            setError("API 키가 설정되지 않았습니다. 환경 변수를 확인하세요.");
            return;
        }

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const examBase64 = await fileToBase64(examFile);
            let solutionBase64: string | null = null;
            if (solutionFile) {
                solutionBase64 = await fileToBase64(solutionFile);
            }

            const failedQuestions: string[] = [];
            const successfulQuestions: { [key: string]: QuestionData } = {};
            let currentExamTitle = '';

            const choiceSchema = {
                type: Type.OBJECT,
                properties: {
                    text: { type: Type.STRING, description: "The full text for a single multiple choice option, excluding the number (e.g., '①')." },
                },
                required: ["text"]
            };
    
            const questionSchema = {
                type: Type.OBJECT,
                properties: {
                    questionNumber: { type: Type.STRING, description: "The question number, e.g., '21'." },
                    prompt: { type: Type.STRING, description: "The question's instruction, e.g., '다음 글의 요지로 가장 적절한 것은?'. It must not contain any markdown or underlines." },
                    promptEnglishPart: { type: Type.STRING, description: "For Q21 ONLY, the exact English phrase from the prompt that should be underlined (e.g., 'a cage seeking a bird')." },
                    passage: { type: Type.STRING, description: "The main reading passage for the question. Preserve original paragraph breaks. For Q29/30, it must contain __UW__ markers and NOT the circled numbers." },
                    starredVocabulary: { type: Type.STRING, description: "If there is a list of vocabulary definitions at the bottom of the passage (usually starting with '*'), extract it here as a single block of text, preserving line breaks." },
                    underlinedText: { type: Type.STRING, description: "For Q21 ONLY, the exact phrase that is underlined in the passage." },
                    choices: { type: Type.ARRAY, items: choiceSchema, description: "An array of all multiple choice options. Each option must be a separate item. Should be OMITTED for Q29, Q30, Q35, Q38 and Q39."},
                    boxedText: { type: Type.STRING, description: "For Q36-39, the initial text to be placed in a box." },
                    mainTextAfterBox: { type: Type.STRING, description: "For Q36-39, the (A), (B), and (C) sections that follow the boxed text. For other questions, this should be null." },
                    summaryPrompt: { type: Type.STRING, description: "For Q40 ONLY, the summary prompt, usually '↓'." },
                    summaryBoxText: { type: Type.STRING, description: "For Q40 ONLY, the summary text to be placed in a separate box. It MUST include '(A)' and '(B)' placeholders." },
                    answer: { type: Type.STRING, description: "The correct answer symbol, e.g., '④'." },
                    translation: { type: Type.STRING, description: "A simple and natural Korean translation of the question's main passage or text." },
                    vocabulary: {
                        type: Type.ARRAY,
                        description: "A list of key vocabulary objects.",
                        items: {
                            type: Type.OBJECT,
                            properties: { word: { type: Type.STRING }, meaning: { type: Type.STRING } },
                            required: ["word", "meaning"]
                        }
                    }
                },
                required: ["questionNumber", "prompt", "answer", "translation", "vocabulary"]
            };
    
            const singleQuestionResponseSchema = {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING, description: "The official title of the exam, e.g., '2025학년도 3월 고2 전국연합학력평가'. This must be included in every response." },
                    questionData: questionSchema
                },
                required: ["questionData", "title"]
            };

            for (const [index, qNum] of allowedQuestions.entries()) {
                if (isCancelledRef.current) {
                    setError("사용자에 의해 분석이 중단되었습니다.");
                    break;
                }
                setLoadingMessage(`${qNum}번 문항 분석 중... (${index + 1}/${allowedQuestions.length})`);
                
                try {
                    const prompt = `You are an expert AI assistant creating analysis for Korean high school English exam questions.
From the provided exam page image, extract and structure the information ONLY for question number ${qNum}.
You MUST also extract the exam's official title (e.g., '2025학년도 3월 고2 전국연합학력평가').
If a solution page is also provided, use it as a reference for accuracy.

Key Formatting Rules by Question Number:
- **General**:
    - Extract all text for question ${qNum} accurately.
    - **Crucially, preserve the original paragraph structure and breaks BETWEEN paragraphs. Lines within the same paragraph should be combined to allow for proper text justification.**
    - **Choices**: When extracting multiple choice options, provide ONLY the text content of the option. DO NOT include the choice number (e.g., '①', '②', '③') in the text itself. The application adds these numbers automatically.
    - The 'translation' must be a simple, natural Korean translation of the main English passage, not a detailed explanation.
    - Provide key vocabulary with Korean meanings.
- **Starred Vocabulary**: If there's a vocabulary list at the very bottom of the main passage (lines often start with an asterisk '*'), extract this entire block into the 'starredVocabulary' field. Preserve the line breaks.
- **Q18-Q20, Q22-Q24 (목적, 심경, 주장, 요지, 주제, 제목)**: These are standard questions. Extract the prompt, passage, and choices.
- **Q21 (함축 의미)**:
    - The passage contains an underlined phrase. Extract this phrase into 'underlinedText'.
    - The prompt also contains an underlined English phrase (e.g., 'a cage seeking a bird'). Extract this phrase into 'promptEnglishPart'.
- **Q29, Q30 (어법/어휘)**: This type has critical formatting rules that must be followed.
    - In the 'passage' text, find the word corresponding to each numbered option (e.g., the word 'being' for option ①).
    - You MUST wrap this exact word with '__UW__' markers. Example: '...what he is __UW__being__UW__ asked...'. This is the only way underlining will be applied.
    - You MUST NOT include the circled numbers (e.g., ①) in the final 'passage' text.
    - The 'choices' array must be OMITTED for this question type.
- **Q31-Q34 (빈칸 추론)**: The main passage has a blank line (e.g., '________'). Preserve this blank line in the 'passage' field.
- **Q35 (흐름과 관계 없는 문장)**:
    - The passage must include the numbered sentences (①, ②, etc.).
    - The 'choices' array must be OMITTED.
- **Q36, Q37 (글의 순서)**:
    - The initial paragraph goes into 'boxedText'.
    - The (A), (B), and (C) sections should be extracted into the 'mainTextAfterBox' field, with each section starting on a new line.
- **Q38, Q39 (문장 삽입)**:
    - The sentence to be inserted goes into 'boxedText'.
    - The main body of text, which contains the insertion point numbers (e.g., (①)), goes into the 'passage' field.
    - The 'choices' array must be OMITTED.
- **Q40 (요약문)**:
    - The main reading text goes into the 'passage' field.
    - The summary sentence (the one with blanks) goes into 'summaryBoxText'. This text MUST include the literal strings '(A)' and '(B)'.
    - The arrow '↓' goes into the 'summaryPrompt' field.
    - The choices are word pairs (e.g., 'recovery ...... connection'). Extract them fully into the 'choices' array.

Schema Adherence: Adhere strictly to the provided JSON schema. Omit any optional fields if they are not present in the question; do not use 'null' as a value. Ensure the output is only for question ${qNum}.`;
                    
                    const parts: any[] = [
                        { text: prompt },
                        { inlineData: { mimeType: examFile.type, data: examBase64 } }
                    ];

                    if (solutionBase64 && solutionFile) {
                        parts.push({ text: "This is the corresponding solution/explanation page for reference:" });
                        parts.push({ inlineData: { mimeType: solutionFile.type, data: solutionBase64 } });
                    }

                    const response = await ai.models.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: { parts },
                        config: {
                            responseMimeType: "application/json",
                            responseSchema: singleQuestionResponseSchema,
                        }
                    });
    
                    const resultText = response.text.trim();
                    const result = JSON.parse(resultText);
    
                    if (result.title && !currentExamTitle) {
                        currentExamTitle = result.title;
                        setExamTitle(result.title);
                    }
                    successfulQuestions[qNum] = result.questionData;
    
                } catch (e) {
                    console.error(`Failed to process question ${qNum}:`, e);
                    failedQuestions.push(qNum);
                }
                // Add delay to prevent rate limiting errors
                await sleep(1200);
            }
            
            if (isCancelledRef.current) {
                setLoadingMessage('분석이 중단되었습니다.');
            }

            setAnalysisData(successfulQuestions);
            setIsProcessed(true);
            
            const successfulKeys = Object.keys(successfulQuestions);
            if (successfulKeys.length > 0) {
                setSelectedQuestions([successfulKeys[0]]);
                if (failedQuestions.length > 0) {
                    setError(`분석이 완료되었으나 일부 문항에 오류가 발생했습니다.\n실패한 문항: ${failedQuestions.join(', ')}`);
                }
            } else if (!isCancelledRef.current) {
                setError(`모든 문항 분석에 실패했습니다. 파일 형식이나 내용을 확인하거나, 잠시 후 다시 시도해 주세요. 복잡한 서식의 경우 인식이 어려울 수 있습니다.`);
            }

        } catch (e) {
            console.error("An unexpected error occurred during analysis setup:", e);
            let detailedError = "An unknown error occurred.";
            if (e instanceof Error) {
                detailedError = e.message;
            } else if (typeof e === 'string') {
                detailedError = e;
            } else if (e && typeof e === 'object' && 'message' in e) {
                detailedError = String(e.message);
            }
            setError(`분석 준비 중 오류가 발생했습니다. 파일을 다시 업로드해주세요.\n\n상세 오류: ${detailedError}`);
            setIsProcessed(false);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileProcessing = async () => {
        if (examFile) {
            isCancelledRef.current = false;
            setIsLoading(true);
            setIsProcessed(false);
            setError(null);
            setAnalysisData(null);
            setLoadingMessage('파일 분석을 시작합니다...');
            await generateAnalysis(examFile, solutionFile);
        }
    };
    
    const handleStopProcessing = () => {
        isCancelledRef.current = true;
        setLoadingMessage('분석을 중단하는 중입니다...');
    };

    const handleDownloadPdf = () => {
        const element = previewRef.current;
        if (!element) return;
        
        const opt = {
          margin:       0,
          filename:     `analysis-sheets.pdf`,
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { scale: 3, useCORS: true, letterRendering: true },
          jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        html2pdf().from(element).set(opt).save();
    };
    
    // FIX: Add type to event object to resolve TS errors.
    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if(e.target.files && e.target.files[0]) {
            setLogoFile(e.target.files[0]);
        }
    }
    const triggerLogoUpload = () => document.getElementById('logo-upload-input')?.click();
    
    // FIX: Add type to event object to resolve 'option.value' TypeScript error.
    const handleQuestionSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selected = Array.from(e.target.selectedOptions, option => option.value);
        setSelectedQuestions(selected);
    };

    return (
        <>
            <header className="app-header">
                <h1>AI 영어 모의고사 해설지 생성기</h1>
                <p>영어 모의고사 시험지를 PDF 파일로 업로드하여 특정 문항의 맞춤형 분석 자료를 만드세요.</p>
            </header>
            <main className="app-container">
                <div className="controls-panel">
                    <h2>작업 설정</h2>
                    <DropZone onFileDrop={setExamFile} file={examFile} title="1. 시험지 PDF 업로드" disabled={isLoading} />
                    <DropZone onFileDrop={setSolutionFile} file={solutionFile} title="2. 해설지 PDF 업로드 (선택)" disabled={isLoading || !examFile} />
                    
                    <div className="action-buttons">
                        {!isLoading && (
                            <button
                                onClick={handleFileProcessing}
                                className="btn-primary"
                                disabled={!examFile || isLoading}
                            >
                                분석 시작
                            </button>
                        )}
                    </div>

                    {isLoading && (
                        <div className="loader">
                             <div className="loader-content">
                                <div className="spinner"></div>
                                <span>{loadingMessage}</span>
                            </div>
                            <button onClick={handleStopProcessing} className="btn-stop">중단</button>
                        </div>
                    )}

                    {error && <div className="error-message">{error}</div>}

                    {isProcessed && analysisData && (
                        <div className="options-section">
                            <div className="option-item">
                                <label htmlFor="question-select">3. 문항 선택 (다중 선택 가능)</label>
                                <select 
                                  id="question-select"
                                  value={selectedQuestions}
                                  onChange={handleQuestionSelect}
                                  multiple
                                >
                                    {Object.keys(analysisData).sort((a, b) => parseInt(a) - parseInt(b)).map(qNum => (
                                        <option key={qNum} value={qNum}>{qNum}</option>
                                    ))}
                                </select>
                                <small>Ctrl(Cmd) 또는 Shift 키를 사용하여 여러 개를 선택하세요.</small>
                            </div>
                            <div className="option-item">
                                <label>(선택) 기관 로고 업로드</label>
                                <input type="file" id="logo-upload-input" accept="image/*" onChange={handleLogoUpload} style={{display: 'none'}} />
                                <button onClick={triggerLogoUpload} className="btn-secondary">
                                    {logoFile ? `${logoFile.name}` : '로고 이미지 선택'}
                                </button>
                            </div>
                            <button onClick={handleDownloadPdf} className="btn-primary" disabled={selectedQuestions.length === 0}>
                                PDF 다운로드
                            </button>
                        </div>
                    )}
                </div>
                <div className="preview-panel">
                    {selectedQuestions.length > 0 && analysisData ? (
                        <div id="preview-content" ref={previewRef}>
                            {selectedQuestions.sort((a, b) => parseInt(a) - parseInt(b)).map(qNum => (
                                analysisData[qNum] ? (
                                    <AnalysisSheet 
                                        key={qNum}
                                        title={examTitle}
                                        questionData={analysisData[qNum]}
                                        logoFile={logoFile}
                                    />
                                ) : null
                            ))}
                        </div>
                    ) : (
                        <div className="preview-placeholder">
                            <p>{isLoading ? '분석 중...' : (isProcessed ? '분석 완료! 좌측에서 문항을 선택하세요.' : '시험지 파일을 업로드하면\n이곳에서 미리보기가 제공됩니다.')}</p>
                        </div>
                    )}
                </div>
            </main>
        </>
    );
};

const container = document.getElementById('root');
// FIX: Add null check for container before creating root.
if (container) {
    const root = ReactDOM.createRoot(container);
    root.render(<App />);
}