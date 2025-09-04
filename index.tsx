// FIX: Import React to resolve 'React' is not defined error.
import React from 'react';
// FIX: Import ReactDOM to resolve 'ReactDOM' is not defined error.
import ReactDOM from 'react-dom/client';
// FIX: Import html2pdf to resolve 'html2pdf' is not defined error.
import html2pdf from 'html2pdf.js';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
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

interface SubQuestion {
    questionNumber: string; // e.g., "41"
    prompt: string;
    choices: Choice[];
    answer: string;
}

interface QuestionData {
    questionNumber: string;
    prompt: string;
    promptEnglishPart?: string | null;
    passage?: string | null;
    starredVocabulary?: string | null;
    underlinedText?: string | null;
    choices?: Choice[] | null;
    boxedText?: string | null;
    mainTextAfterBox?: string | null;
    summaryPrompt?: string | null;
    summaryBoxText?: string | null;
    answer: string;
    translation: string;
    vocabulary: VocabularyItem[];
    subQuestions?: SubQuestion[];
}


// FIX: Add types for component props.
interface FormattedQuestionProps {
    data: QuestionData;
}

const FormattedQuestion: React.FC<FormattedQuestionProps> = ({ data }) => {
    const renderPrompt = () => {
        if (!data.prompt) return null;
        let content: (string | JSX.Element)[] = [data.prompt];

        // Q21 English underline
        if (data.questionNumber === '21' && data.promptEnglishPart) {
            content = content.flatMap(segment =>
                typeof segment === 'string' && segment.includes(data.promptEnglishPart!)
                    ? segment.split(data.promptEnglishPart!).flatMap((part, i, arr) =>
                        i < arr.length - 1 ? [part, <u key={`en-${i}`}>{data.promptEnglishPart}</u>] : [part]
                    )
                    : [segment]
            );
        }

        // '틀린', '않는', '없는' underline
        const keywords = ['틀린', '않는', '없는'];
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
    
        let passageContent: any = data.passage;
    
        // For Q32, 33, 34, dynamically size the blank based on the answer.
        if (['32', '33', '34'].includes(data.questionNumber) && typeof passageContent === 'string') {
            const blankRegex = /(_{5,})/;
            if (blankRegex.test(passageContent)) {
                const answerIndex = ['①', '②', '③', '④', '⑤'].indexOf(data.answer);
                if (data.choices && answerIndex > -1 && data.choices[answerIndex]) {
                    const answerText = data.choices[answerIndex].text;
                    const blankSpan = <span className="answer-blank" key="blank"><span className="answer-blank-text">{answerText}</span></span>;
                    const parts = passageContent.split(blankRegex);
                    passageContent = <>{parts.map((part, i) => (part.match(blankRegex) ? blankSpan : part))}</>;
                }
            }
        }
        // For Q29/30, find circled numbers and underline the marked word/phrase.
        else if ((data.questionNumber === '29' || data.questionNumber === '30') && typeof passageContent === 'string') {
            // This regex splits the string, keeping the delimiters.
            // Delimiter: (a circled number, optional space, __U__, content, __U__)
            const regex = /((?:①|②|③|④|⑤)\s*__U__.*?__U__)/g;
            const parts = passageContent.split(regex);
        
            // This regex extracts the marker and content from a delimiter part.
            const subRegex = /(①|②|③|④|⑤)\s*__U__(.*?)__U__/;
        
            passageContent = (
                <>
                    {parts.map((part, index) => {
                        const match = part.match(subRegex);
                        if (match) {
                            const marker = match[1];
                            const textToUnderline = match[2];
                            // Reconstruct with the marker and the underlined text.
                            return (
                                <React.Fragment key={index}>
                                    {marker} <u>{textToUnderline}</u>
                                </React.Fragment>
                            );
                        }
                        return part; // This is the text between matches
                    })}
                </>
            );
        }
         // For Q41-42, underline words next to (a), (b), etc.
         else if (data.questionNumber === '41-42' && typeof passageContent === 'string') {
            const regex = /(\([a-e]\)\s+)(\S+)/g;
            const parts = passageContent.split(regex); // Split and keep delimiters
            passageContent = (
                <>
                    {parts.map((part, index) => {
                        // The word to underline is the 2nd captured group, which lands at index 2, 5, 8, etc.
                        if (index > 0 && index % 3 === 2) { 
                            return <u key={index}>{part}</u>;
                        }
                        return part;
                    })}
                </>
            );
        }
        // For underlined text. Handle Q21's potential AI artifact specifically.
        else if (data.underlinedText && typeof passageContent === 'string') {
            // Sanitize underlined text from AI in case it includes HTML tags
            const cleanUnderlinedText = data.underlinedText.replace(/<\/?u>/g, '');

            if (passageContent.includes(cleanUnderlinedText)) {
                const parts = passageContent.split(cleanUnderlinedText);
                let firstPart = parts[0];
                
                if (data.questionNumber === '21') {
                    // Make regex more robust by making colon optional.
                    firstPart = firstPart.replace(/underlinedText\s*:?\s*$/, '');
                }
                passageContent = (
                    <>
                        {firstPart}<u>{cleanUnderlinedText}</u>{parts.slice(1).join(cleanUnderlinedText)}
                    </>
                );
            }
        }
    
        return <div className="question-passage">{passageContent}</div>;
    };
    

    const renderStarredVocabulary = () => {
        if (!data.starredVocabulary) return null;
        const vocabWithStars = data.starredVocabulary
            .split('\n')
            .filter(line => line.trim() !== '')
            .map(line => `* ${line.trim()}`)
            .join('\n');
        return <pre className="starred-vocabulary">{vocabWithStars}</pre>;
    };
    
    const renderMainTextAfterBox = () => {
        if (!data.mainTextAfterBox || ['31', '32', '33', '34'].includes(data.questionNumber)) return null;

        let text = data.mainTextAfterBox;
        // Clean up duplicated vocab from passage for Q36/37 before rendering.
        if (['36', '37'].includes(data.questionNumber) && data.starredVocabulary) {
            text = text.replace(data.starredVocabulary, '').trim();
        }

        if (data.questionNumber === '36' || data.questionNumber === '37') {
            // Split by (A), (B), (C) to create separate paragraphs with hanging indents
            const parts = text.split(/(\([A-C]\))/).filter(part => part.trim() !== '');
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

        return <div className="question-after-box">{text}</div>;
    };

    const renderChoices = () => {
        if (!data.choices || data.choices.length === 0) {
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
                         if (!choice) return null; // FIX: Prevent crash if a choice item is null
                         if (data.questionNumber === '40') {
                            const parts = (choice.text || '').split(/\s*\.{2,}\s*|\s{2,}/);
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

    if (data.subQuestions && data.subQuestions.length > 0) {
        return (
            <div className="question-text-container">
                {renderPassage()}
                <div className="starred-vocabulary-container">{renderStarredVocabulary()}</div>
                <div className="sub-questions-container">
                    {data.subQuestions.map((subQ) => (
                        <div key={subQ.questionNumber} className="sub-question">
                            <p className="question-prompt">{subQ.questionNumber}. {subQ.prompt}</p>
                            <ul className={`question-choices ${subQ.questionNumber === '42' ? 'choices-horizontal' : ''}`}>
                                {subQ.choices.map((choice, choiceIdx) => (
                                    <li key={choiceIdx}>{'①②③④⑤'[choiceIdx]} {choice.text}</li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="question-text-container">
            {renderPrompt()}
            {data.boxedText && <div className="boxed-text">{data.boxedText}</div>}
            
            {/* Conditional rendering for Q36/37 vocab placement */}
            {['36', '37'].includes(data.questionNumber) ? (
                <>
                    {renderPassage()}
                    {renderMainTextAfterBox()}
                    <div className="starred-vocabulary-container">{renderStarredVocabulary()}</div>
                </>
            ) : (
                <>
                    {renderPassage()}
                    <div className="starred-vocabulary-container">{renderStarredVocabulary()}</div>
                    {renderMainTextAfterBox()}
                </>
            )}

            {data.questionNumber === '40' && data.summaryBoxText && <div className="summary-arrow">↓</div>}
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
    logoDataUrl: string | null;
}

const AnalysisSheet: React.FC<AnalysisSheetProps> = ({ title, questionData, logoDataUrl }) => {
    const displayTitle = title.replace('문제지', '해설지');

    const renderTranslation = () => {
        const { translation } = questionData;

        if (!translation) return null;

        // Generalize __ANSWER__ handling for any question that might use it
        if (translation.includes('__ANSWER__')) {
            // This regex splits the string by the markers, capturing the content between them.
            const parts = translation.split(/__ANSWER__(.*?)__ANSWER__/);
            
            return (
                <>
                    {parts.map((part, index) => {
                        // The content to be underlined is at odd indices.
                        if (index % 2 === 1) {
                            return <u key={index}>{part}</u>;
                        }
                        // The text before and after the markers is at even indices.
                        return part;
                    })}
                </>
            );
        }
        return translation;
    };

    const getVocabLimit = (questionNumber: string): number => {
        if (questionNumber === '41-42') {
            return 12; 
        }
        // Q40: very content heavy with summary box
        if (questionNumber === '40') {
            return 12; // Reduced from 15 to prevent overflow
        }
        // Questions with long passages/multiple parts get fewer vocab words to prevent overflow
        if (['31', '32', '33', '34', '36', '37', '38'].includes(questionNumber)) {
            return 18;
        }
        // Questions with medium-length passages
        if (['29', '30', '35', '39'].includes(questionNumber)) {
            return 22; // Reduced from 25
        }
        // Questions with very short passages/prompts can have more to fill space
        if (['18', '19', '20'].includes(questionNumber)) {
            return 35;
        }
        // Default for standard questions (21-24)
        return 25;
    };
    
    const vocabLimit = getVocabLimit(questionData.questionNumber);

    return (
        <div className="analysis-sheet">
            <div className="preview-header">
                <span className="title">{displayTitle}</span>
                <span className="info">학번 ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ) 이름 ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</span>
            </div>
            <div className="preview-body">
                <div className="question-main-content">
                    <div className="question-content">
                         <h2 className="question-number">{questionData.questionNumber.replace('-', '~')}</h2>
                        <FormattedQuestion data={questionData} />
                    </div>
                </div>
                <div className="analysis-content">
                    <h3>해석</h3>
                    <div className="explanation-block">{renderTranslation()}</div>
                    {questionData.subQuestions && questionData.subQuestions.length > 0 ? (
                        <div className="answer-group">
                            {questionData.subQuestions.map(subQ => (
                                <p key={subQ.questionNumber} className="answer-text">
                                    {subQ.questionNumber}번 정답: {subQ.answer}
                                </p>
                            ))}
                        </div>
                    ) : (
                        <p className="answer-text">정답: {questionData.answer}</p>
                    )}
                    <div className="vocabulary-block">
                        <h4>어휘 및 어구</h4>
                        <ul>
                            {questionData.vocabulary.slice(0, vocabLimit).map((item, index) => (
                                <li key={index}>{item.word} - {item.meaning}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
            <div className="preview-footer">
                {logoDataUrl && <img src={logoDataUrl} alt="logo" className="logo-placeholder" />}
            </div>
        </div>
    );
};

/**
 * Sanitizes the raw JSON response from the AI to prevent rendering errors.
 * It ensures that properties expected to be strings are strings, and that
 * arrays of objects (like choices and vocabulary) are well-formed.
 * @param data The raw data object parsed from the AI's JSON response.
 * @returns A sanitized data object that is safer to render.
 */
function sanitizeAIResponse(data: { [key: string]: any }): { [key: string]: QuestionData } {
    if (!data || typeof data !== 'object') return {};

    Object.values(data).forEach(question => {
        if (!question || typeof question !== 'object') return;

        // List of keys that are expected to be strings or null
        const stringKeys: (keyof QuestionData)[] = [
            'questionNumber', 'prompt', 'promptEnglishPart', 'passage',
            'starredVocabulary', 'underlinedText', 'boxedText',
            'mainTextAfterBox', 'summaryPrompt', 'summaryBoxText', 'answer', 'translation'
        ];

        stringKeys.forEach(key => {
            const value = question[key];
             // Allow null, but convert other non-string types to string to prevent crashes.
            if (value !== undefined && value !== null && typeof value !== 'string') {
                console.warn(`Sanitizing non-string value for key '${key}' in question ${question.questionNumber}:`, value);
                (question as any)[key] = JSON.stringify(value, null, 2);
            }
        });

        // Sanitize choices array
        if (Array.isArray(question.choices)) {
            question.choices = question.choices.filter(Boolean); // Remove null/undefined items
            question.choices.forEach((choice: any) => {
                if (choice && typeof choice.text !== 'string') {
                    console.warn(`Sanitizing non-string value for choice text in question ${question.questionNumber}:`, choice.text);
                    choice.text = JSON.stringify(choice.text, null, 2);
                }
            });
        } else if (question.choices === undefined) {
             // Do nothing if undefined, but if it's some other non-array type, reset it.
        } else if (question.choices !== null) {
            console.warn(`Sanitizing non-array value for 'choices' in question ${question.questionNumber}:`, question.choices);
            question.choices = []; // Reset to a safe value
        }


        // Sanitize vocabulary array
        if (Array.isArray(question.vocabulary)) {
            question.vocabulary = question.vocabulary.filter(Boolean); // Remove null/undefined items
            question.vocabulary.forEach((item: any) => {
                if (item) {
                    if (typeof item.word !== 'string') {
                        console.warn(`Sanitizing non-string value for vocab word in question ${question.questionNumber}:`, item.word);
                        item.word = JSON.stringify(item.word);
                    }
                    if (typeof item.meaning !== 'string') {
                        console.warn(`Sanitizing non-string value for vocab meaning in question ${question.questionNumber}:`, item.meaning);
                        item.meaning = JSON.stringify(item.meaning);
                    }
                }
            });
        } else if (question.vocabulary) {
             console.warn(`Sanitizing non-array value for 'vocabulary' in question ${question.questionNumber}:`, question.vocabulary);
             question.vocabulary = []; // Reset to a safe value
        }
        
        // Sanitize subQuestions array
        if (Array.isArray(question.subQuestions)) {
            question.subQuestions = question.subQuestions.filter(Boolean);
            question.subQuestions.forEach((subQ: any) => {
                if (subQ) {
                    if (typeof subQ.questionNumber !== 'string') {
                        subQ.questionNumber = String(subQ.questionNumber);
                    }
                    if (typeof subQ.prompt !== 'string') {
                        subQ.prompt = String(subQ.prompt);
                    }
                    if (typeof subQ.answer !== 'string') {
                        subQ.answer = String(subQ.answer);
                    }
                    if (Array.isArray(subQ.choices)) {
                        subQ.choices = subQ.choices.filter(Boolean);
                        subQ.choices.forEach((choice: any) => {
                            if (choice && typeof choice.text !== 'string') {
                                choice.text = JSON.stringify(choice.text, null, 2);
                            }
                        });
                    } else if (subQ.choices) {
                        subQ.choices = [];
                    }
                }
            });
        } else if (question.subQuestions) {
            question.subQuestions = [];
        }
    });

    return data as { [key:string]: QuestionData };
}

const App = () => {
    const [examFile, setExamFile] = useState<File | null>(null);
    const [solutionFile, setSolutionFile] = useState<File | null>(null);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
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
    
    const allowedQuestions = useMemo(() => ['18', '19', '20', '21', '22', '23', '24', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41-42'], []);

    // Effect to convert logoFile to a data URL for stable PDF generation
    useEffect(() => {
        if (!logoFile) {
            setLogoDataUrl(null);
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
            setLogoDataUrl(reader.result as string);
        };
        reader.readAsDataURL(logoFile);
    }, [logoFile]);

    const generateAnalysis = async (examFile: File, solutionFile: File | null) => {
        if (!examFile) {
            setError("시험지 파일을 선택해주세요.");
            return;
        }
    
        setIsLoading(true);
        setIsProcessed(false);
        setError(null);
        setAnalysisData(null);
        isCancelledRef.current = false;
        setExamTitle(examFile.name.replace(/\.[^/.]+$/, ""));
    
        try {
            const maxRetries = 3;
            let lastError: Error | null = null;
    
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                if (isCancelledRef.current) return;
    
                try {
                    if (attempt > 0) {
                        setLoadingMessage(`일시적인 오류가 발생하여 재시도합니다... (${attempt}/${maxRetries - 1})`);
                        await sleep(Math.pow(2, attempt) * 1000); // Exponential backoff (2s, 4s)
                        if (isCancelledRef.current) return;
                    } else {
                        setLoadingMessage('파일을 분석 중입니다... (최대 1분 소요)');
                    }
    
                    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
                    const examFileBase64 = await fileToBase64(examFile);
                    const examPart = {
                        inlineData: {
                            mimeType: examFile.type,
                            data: examFileBase64,
                        },
                    };
    
                    const solutionPart = solutionFile ? {
                        inlineData: {
                            mimeType: solutionFile.type,
                            data: await fileToBase64(solutionFile),
                        },
                    } : null;
    
                    const basePrompt = `You are an expert AI assistant specializing in parsing English exam papers. Your primary goal is to visually reconstruct the provided exam questions into a structured JSON array. Adhere to the provided schema with extreme precision for the requested question numbers: ${selectedQuestions.join(', ')}. Your output MUST be a single, valid JSON array.

**Core Directives:**
1.  **Visual Fidelity:** Replicate the text and structure from the PDF exactly. This includes all prompts, passages, choices, boxed text, and starred vocabulary.
2.  **Schema Adherence:** If a schema field is not applicable for a given question (e.g., 'choices' for Q29), its value in the JSON MUST be \`null\`. Crucially, for questions that have a text body (like 18-24), the 'passage' field MUST NOT be null.
3.  **Content Integrity:** Do NOT duplicate content across different fields. For example, for questions 31-34, the passage should ONLY be in the 'passage' field.
4.  **Translation Mandate:** For EVERY question parsed, the 'translation' field is MANDATORY. It MUST contain a complete and accurate Korean translation of the question's main content (passage, boxed text, etc.). Crucially, it MUST NOT include a translation of the instructional prompt (e.g., "다음 글의 목적으로 가장 적절한 것은?") or the multiple-choice options. The translation must be a cohesive, natural-sounding paragraph.
5.  **Vocabulary Mandate:** For every question, provide a comprehensive list of at least 20 relevant vocabulary items. This is crucial for filling the layout space correctly.
6.  **Choices Mandate:**
    - For questions WITH multiple-choice options (e.g., 18-28, 31-34, 40), you MUST populate the 'choices' array with all five options.
    - For questions WITHOUT multiple-choice options listed at the bottom (29, 30, 35, 38, 39), the 'choices' field MUST be \`null\`.

**IMPORTANT Rule for Choices:**
- When populating the \`choices\` array for ANY question, the \`text\` field for each choice object MUST contain ONLY the text of the option.
- **DO NOT** include the leading number marker (e.g., "①", "②", "③"). The application's user interface will add these markers automatically.
- Correct example: \`{ "text": "The importance of teamwork" }\`
- Incorrect example: \`{ "text": "① The importance of teamwork" }\`

**Question-Specific Formatting Rules:**

- **Questions 18-24 (Purpose, Mood, Claim, etc.):**
  - The instructional sentence (e.g., "다음 글의 목적으로 가장 적절한 것은?") MUST go into the 'prompt' field.
  - The main body of text that follows the instruction MUST go into the 'passage' field. The 'passage' field MUST NOT be null for these questions.

- **Question 21:**
  - The prompt contains a Korean part and an English part. The English part that is the subject of the question MUST be extracted into the 'promptEnglishPart' field for underlining in the prompt.
  - The same English text MUST also be populated in the 'underlinedText' field. This text appears within the 'passage' and must be underlined there.

- **Questions 31-34 (Blank-filling):**
  - The prompt (e.g., "다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.") MUST go ONLY into the 'prompt' field. It MUST NOT contain any part of the passage, especially not the sentence with the blank.
  - The entire passage containing the blank MUST go ONLY into the 'passage' field. When representing the blank, use a moderately sized underscore line (e.g., \`________\`) to avoid creating large word gaps when justified.
  - The 'mainTextAfterBox' field MUST be \`null\`. Do NOT duplicate the passage content.
  - **Translation:** The translation MUST be a complete Korean text with the correct answer filling the blank. The translated part corresponding to the answer MUST be wrapped in \`__ANSWER__\` markers. For example: \`...이 __ANSWER__새로운 발견__ANSWER__은 중요합니다.\`

- **Questions 29, 30 (Grammar/Wording):**
  - **Absolute Precision Required:** Your analysis for these questions must be flawless. The underline must be placed on the exact word or grammatical phrase being tested, as shown in the source PDF. Misplacing the underline is a failure.
  - **Identification Rule:** In the 'passage' field, find the locations corresponding to the five choices. At each location, you MUST insert the choice marker (e.g., ①) and then wrap ONLY the grammatically relevant word OR PHRASE in \`__U__\` markers.
  - It is mandatory that all five locations are identified and marked correctly.
  - This is critical for handling phrases like "preposition + relative pronoun" where both words must be underlined together.
  - **Correct Example (Single Word):** "... is a process ① __U__referred__U__ to as..."
  - **Correct Example (Phrase):** "... the person ④ __U__for whom__U__ it was intended."
  - **Correct Example (Verb Form):** "... began to ② __U__wonder__U__ if..."
  - **INCORRECT Example (Over-underlining):** "... began to __U__to wonder__U__ if..." (Incorrect because 'to' is part of the infinitive but not the word being tested for choice).
  - The 'choices' field MUST be \`null\`.

- **Question 35 (Flow):**
  - For question 35, combine the entire text, including any introductory sentence that might be in a box, into a single paragraph within the 'passage' field.
  - The 'passage' text MUST include the numbered insertion markers (e.g., ①, ②). These markers should appear directly in the text WITHOUT any surrounding parentheses.
  - The 'boxedText' field for question 35 MUST be \`null\`.
  - The 'choices' field MUST be \`null\`.
  - **Translation:** Provide a single, complete Korean paragraph. It is crucial that you DO NOT include numbered markers like ①, ②, etc. in the final translation.

- **Questions 38, 39 (Insertion):**
  - The initial sentence/paragraph (often in a box) MUST be extracted into the 'boxedText' field.
  - The main passage with insertion points (e.g., (①), (②)) MUST go into the 'passage' field. These numbered markers MUST be included in the text EXACTLY as they appear in the source.
  - The 'choices' field MUST be \`null\`.
  - **Translation:** For the 'translation' field, provide a SINGLE, complete Korean paragraph. This paragraph MUST be the translation of the main passage with the boxed sentence correctly inserted. It is absolutely forbidden to include numbered markers like (①), (②) in the translation; any inclusion is a failure. The translated sentence corresponding to the 'boxedText' MUST be wrapped in \`__ANSWER__\` markers for underlining. Example: '... 문장입니다. __ANSWER__삽입될 문장의 번역__ANSWER__ 그리고 이어지는 문장...'

- **Questions 36, 37 (Sequencing):**
  - The initial sentence/paragraph MUST be extracted into the 'boxedText' field.
  - The text sections marked (A), (B), and (C) should be a single string in the 'mainTextAfterBox' field.
  - Each choice option (e.g., ①, ②) must follow the format '(A) - (C) - (B)'. Populate the 'choices' array accordingly.
  - **Translation:** Provide a complete Korean translation of the initial 'boxedText' followed by the translations of paragraphs (A), (B), and (C) presented in the correct order based on the answer. The markers (A), (B), and (C) MUST be included in the final translated text to clearly show the correct sequence.

- **Question 40 (Summary):**
  - The main passage before the summary box goes into the 'passage' field.
  - The summary sentence (e.g., "다음 글의 내용을 한 문장으로 요약하고자 한다...") goes ONLY into 'summaryPrompt'. Do NOT include it in the main 'prompt' field.
  - The summary text itself, with blanks (A) and (B), goes into 'summaryBoxText'.
  - Choices text must contain both parts for (A) and (B), separated by '.....' or whitespace. Example: "active ..... passive".
  - **Translation:** The 'translation' MUST consist of ONLY two parts: the Korean translation of the main passage, followed by a newline character ('\\n'), and then the completed Korean summary sentence. It is MANDATORY that you DO NOT translate the 'summaryPrompt' (e.g., "다음 글의 내용을 한 문장으로 요약하고자 한다..."). The completed summary must have the correct answers for (A) and (B) filled in, and the translated words for (A) and (B) MUST be individually wrapped in \`__ANSWER__\` markers.

- **Question 41-42 (Combined Long Passage):**
  - The \`questionNumber\` field MUST be "41-42".
  - The shared long passage MUST go into the \`passage\` field.
  - The \`subQuestions\` field MUST contain an array of two objects, one for question 41 and one for question 42.
  - **Translation & Vocabulary:** The 'translation' and 'vocabulary' fields must be for the entire shared passage. The translation MUST be a complete Korean translation of the entire passage. A partial translation is a failure. Within this complete translation, you MUST find the Korean words that correspond to the underlined English words marked (a) through (e) in the passage (which are relevant to question 42) and wrap each of these five Korean words/phrases with \`__ANSWER__\` markers for underlining.
  - **For sub-question 41:**
    - \`questionNumber\`: "41"
    - \`prompt\`: The prompt for question 41 (e.g., "윗글의 제목으로 가장 적절한 것은?").
    - \`choices\`: The five multiple-choice options for question 41.
    - \`answer\`: The correct answer number (e.g., "①") for question 41.
  - **For sub-question 42:**
    - \`questionNumber\`: "42"
    - \`prompt\`: The prompt for question 42 (e.g., "밑줄 친 (a)~(e) 중에서 문맥상 낱말의 쓰임이 적절하지 않은 것은?").
    - \`choices\`: The five multiple-choice options for question 42.
    - \`answer\`: The correct answer number (e.g., "③") for question 42.
  - The top-level \`prompt\`, \`choices\`, and \`answer\` fields for the "41-42" object MUST be \`null\`.
`;
    
                    const contents = {
                        parts: [
                            { text: basePrompt },
                            examPart,
                            ...(solutionPart ? [{ text: "\nHere is the solution sheet:" }, solutionPart] : [])
                        ]
                    };
                    
                    const responseSchema = {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                questionNumber: { type: Type.STRING },
                                prompt: { type: Type.STRING, nullable: true },
                                passage: { type: Type.STRING, nullable: true },
                                choices: {
                                    type: Type.ARRAY,
                                    nullable: true,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: { text: { type: Type.STRING } },
                                        required: ['text'],
                                    }
                                },
                                answer: { type: Type.STRING, nullable: true },
                                translation: { type: Type.STRING },
                                vocabulary: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            word: { type: Type.STRING },
                                            meaning: { type: Type.STRING }
                                        },
                                        required: ['word', 'meaning'],
                                    }
                                },
                                promptEnglishPart: { type: Type.STRING, nullable: true },
                                starredVocabulary: { type: Type.STRING, nullable: true },
                                underlinedText: { type: Type.STRING, nullable: true },
                                boxedText: { type: Type.STRING, nullable: true },
                                mainTextAfterBox: { type: Type.STRING, nullable: true },
                                summaryPrompt: { type: Type.STRING, nullable: true },
                                summaryBoxText: { type: Type.STRING, nullable: true },
                                subQuestions: {
                                    type: Type.ARRAY,
                                    nullable: true,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            questionNumber: { type: Type.STRING },
                                            prompt: { type: Type.STRING },
                                            choices: {
                                                type: Type.ARRAY,
                                                items: {
                                                    type: Type.OBJECT,
                                                    properties: { text: { type: Type.STRING } },
                                                    required: ['text']
                                                }
                                            },
                                            answer: { type: Type.STRING }
                                        },
                                        required: ['questionNumber', 'prompt', 'choices', 'answer']
                                    }
                                },
                            },
                            required: ['questionNumber', 'translation', 'vocabulary'],
                        }
                    };
    
                    setLoadingMessage('AI가 분석 중입니다... (1/2)');
                    const response = await ai.models.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: contents,
                        config: {
                            responseMimeType: "application/json",
                            responseSchema: responseSchema,
                        }
                    });
    
                    if (isCancelledRef.current) return;
    
                    setLoadingMessage('결과를 처리 중입니다... (2/2)');
                    let jsonText = response.text.trim();
                     // Handle potential markdown fences
                    if (jsonText.startsWith('```json')) {
                        jsonText = jsonText.slice(7, -3).trim();
                    } else if (jsonText.startsWith('```')) {
                        jsonText = jsonText.slice(3, -3).trim();
                    }
                    
                    const parsedArray = JSON.parse(jsonText);

                    if (!Array.isArray(parsedArray) || parsedArray.length === 0) {
                         throw new Error("AI가 파일에서 유효한 문제 정보를 추출하지 못했습니다. 파일이 선명한지, 선택한 문항이 파일에 포함되어 있는지 확인 후 다시 시도해주세요.");
                    }

                    // Convert array to the object structure the app expects { '18': {...}, '19': {...} }
                    const parsedData = parsedArray.reduce((acc, question) => {
                        if (question && question.questionNumber) {
                            acc[question.questionNumber] = question;
                        }
                        return acc;
                    }, {} as { [key: string]: QuestionData });


                    const sanitizedData = sanitizeAIResponse(parsedData);
    
                    if (!sanitizedData || Object.keys(sanitizedData).length === 0) {
                        throw new Error("AI가 파일에서 유효한 문제 정보를 추출하지 못했습니다. 파일이 선명한지, 선택한 문항이 파일에 포함되어 있는지 확인 후 다시 시도해주세요.");
                    }
    
                    setAnalysisData(sanitizedData);
                    setIsProcessed(true);
    
                    // Success! Exit the function.
                    return;
    
                } catch (err) {
                    console.error(`Attempt ${attempt + 1} failed:`, err);
                    lastError = err as Error;
                }
            }
    
            if (lastError) {
                throw lastError;
            }
    
        } catch (err) {
            console.error(err);
            const errorMessage = (err as Error).message || 'An unknown error occurred.';
            setError(`분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.\n\n오류 상세: ${errorMessage}`);
        } finally {
            setIsLoading(false);
            setLoadingMessage('파일을 분석 중입니다... (최대 1분 소요)');
        }
    };
    
    const handleFileDrop = (setter: React.Dispatch<React.SetStateAction<File | null>>) => (file: File) => {
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            setError(`${file.type}은(는) 지원하지 않는 파일 형식입니다. PDF 또는 이미지 파일을 업로드해주세요.`);
            return;
        }

        const MAX_FILE_SIZE_MB = 10;
        const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
        if (file.size > MAX_FILE_SIZE_BYTES) {
            setError(`파일 크기는 ${MAX_FILE_SIZE_MB}MB를 초과할 수 없습니다. 더 작은 파일을 업로드해주세요.`);
            return;
        }
        
        setError(null);
        setter(file);
    };

    const handleSelectAll = () => {
        setSelectedQuestions(allowedQuestions);
    };

    const handleClearAll = () => {
        setSelectedQuestions([]);
    };
    
    const handleGenerateClick = () => {
        if (examFile) {
            generateAnalysis(examFile, solutionFile);
        } else {
            setError("시험지 파일을 업로드해주세요.");
        }
    };
    
    const handleDownload = async () => {
        if (!previewRef.current || selectedQuestions.length === 0) return;
    
        const originalTitle = document.title;
        const filename = `${examTitle}_해설지.pdf`;
        document.title = filename;
    
        const overlay = document.createElement('div');
        overlay.id = 'pdf-loader-overlay';
        overlay.innerHTML = `
            <div class="loader-content">
                <div class="spinner"></div>
                <span id="pdf-progress-text">PDF 생성 준비 중...</span>
            </div>`;
        document.body.appendChild(overlay);
        const progressText = document.getElementById('pdf-progress-text');
    
        try {
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
            });
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
    
            const sheets = Array.from(previewRef.current.querySelectorAll('.analysis-sheet'));
            
            for (let i = 0; i < sheets.length; i++) {
                if (progressText) {
                    progressText.textContent = `PDF 생성 중... (${i + 1}/${sheets.length} 페이지)`;
                }
                const sheet = sheets[i] as HTMLElement;
                // FIX: Removed the unsupported 'dpi' option from html2canvas. The 'scale' option is used to control the output resolution for better quality.
                const canvas = await html2canvas(sheet, {
                    scale: 2,
                    useCORS: true,
                    // Allow images from other origins to be drawn
                    allowTaint: true,
                });
    
                const imgData = canvas.toDataURL('image/jpeg', 0.98);
    
                if (i > 0) {
                    pdf.addPage();
                }
                pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            }
    
            pdf.save(filename);
    
        } catch (e) {
            console.error("PDF generation failed:", e);
            setError(`PDF 생성 중 오류가 발생했습니다: ${(e as Error).message}`);
        } finally {
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
            document.title = originalTitle;
        }
    };
    
    const handleStop = () => {
        isCancelledRef.current = true;
        setIsLoading(false);
    };

    const sortedAnalysisData = useMemo(() => {
        if (!analysisData) return [];
        return Object.values(analysisData).sort((a, b) => {
            const numA = parseInt(a.questionNumber, 10);
            const numB = parseInt(b.questionNumber, 10);
            return numA - numB;
        });
    }, [analysisData]);

    return (
        <>
            <header className="app-header">
                <h1>AI 영어 모의고사 해설지 생성기</h1>
                <p>영어 모의고사 PDF를 업로드하여 문항별 맞춤 해설지를 만들어보세요.</p>
            </header>
            <div className="app-container">
                <aside className="controls-panel">
                    <h2>설정</h2>
                    <DropZone onFileDrop={handleFileDrop(setExamFile)} file={examFile} title="1. 시험지 업로드" disabled={isLoading} />
                    <DropZone onFileDrop={handleFileDrop(setSolutionFile)} file={solutionFile} title="2. 정답지 업로드 (선택 사항)" disabled={isLoading} />
                    <DropZone onFileDrop={handleFileDrop(setLogoFile)} file={logoFile} title="3. 로고 업로드 (선택 사항)" disabled={isLoading} />
                    
                    {error && <div className="error-message">{error}</div>}
                    
                    <div className="options-section">
                        <div className="option-item">
                            <label htmlFor="question-select">4. 문항 선택</label>
                             <div style={{display: 'flex', gap: '0.5rem', marginBottom: '0.5rem'}}>
                                <button onClick={handleSelectAll} disabled={isLoading} className="btn-secondary" style={{width: '50%'}}>전체 선택</button>
                                <button onClick={handleClearAll} disabled={isLoading} className="btn-secondary" style={{width: '50%'}}>전체 해제</button>
                            </div>
                            <select
                                id="question-select"
                                multiple
                                value={selectedQuestions}
                                onChange={(e) => setSelectedQuestions(Array.from(e.target.selectedOptions, option => option.value))}
                                disabled={isLoading}
                            >
                                {allowedQuestions.map(q => <option key={q} value={q}>{q.replace('-', '~')}번</option>)}
                            </select>
                            <small>Ctrl 또는 Shift 키를 눌러 여러 문항을 선택할 수 있습니다.</small>
                        </div>
                    </div>

                    <div className="action-buttons">
                         <button 
                            className="btn-primary" 
                            onClick={handleGenerateClick} 
                            disabled={!examFile || selectedQuestions.length === 0 || isLoading}
                        >
                            {isLoading ? '생성 중...' : '해설지 생성'}
                        </button>
                    </div>

                    {isLoading && (
                        <div className="loader">
                            <div className="loader-content">
                                <div className="spinner"></div>
                                <span>{loadingMessage}</span>
                            </div>
                            <button onClick={handleStop} className="btn-stop">중지</button>
                        </div>
                    )}
                    
                    {isProcessed && (
                        <div className="action-buttons">
                             <button className="btn-primary" onClick={handleDownload} disabled={selectedQuestions.length === 0}>
                                PDF로 다운로드
                            </button>
                        </div>
                    )}
                </aside>
                <main className="preview-panel">
                     {!isProcessed ? (
                        <div className="preview-placeholder">
                            <p>오른쪽에서 설정을 완료하고 '해설지 생성' 버튼을 누르면 여기에 결과가 표시됩니다.</p>
                        </div>
                    ) : (
                        <div id="preview-content" ref={previewRef}>
                            {sortedAnalysisData.map(data => (
                                <AnalysisSheet 
                                    key={data.questionNumber}
                                    title={examTitle}
                                    questionData={data} 
                                    logoDataUrl={logoDataUrl}
                                />
                            ))}
                        </div>
                    )}
                </main>
            </div>
        </>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);