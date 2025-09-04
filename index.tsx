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
    
        let passageContent: any = data.passage;
    
        // Q33: Fix blank spacing by replacing a regular space before a long underscore with a non-breaking space.
        if (data.questionNumber === '33') {
            passageContent = passageContent.replace(/\s(_{5,})/g, '\u00A0$1');
        }
    
        // For Q29/30, find numbered markers like __1__text__1__ and replace them
        if ((data.questionNumber === '29' || data.questionNumber === '30') && typeof passageContent === 'string') {
            const choiceMarkers = ['①', '②', '③', '④', '⑤'];
            const regex = /__(\d)__(.*?)__\1__/g;
            const elements: (string | JSX.Element)[] = [];
            let lastIndex = 0;
            let match;
            
            while ((match = regex.exec(passageContent)) !== null) {
                // Push the text segment before the match
                if (match.index > lastIndex) {
                    elements.push(passageContent.substring(lastIndex, match.index));
                }
                
                const number = parseInt(match[1], 10);
                const text = match[2].trim();

                // Ensure number is within bounds
                if (number >= 1 && number <= 5) {
                    elements.push(
                        <React.Fragment key={match.index}>
                            {choiceMarkers[number - 1]}<u>{text}</u>
                        </React.Fragment>
                    );
                } else {
                    // Fallback for invalid numbers, just show the original text
                    elements.push(match[0]);
                }
                
                lastIndex = regex.lastIndex;
            }
            
            // Push any remaining text after the last match
            if (lastIndex < passageContent.length) {
                elements.push(passageContent.substring(lastIndex));
            }

            // If any matches were found, the content is now an array of elements
            if (elements.length > 0) {
                passageContent = <>{elements}</>;
            }
        }
        // For Q21, handle specific underlined text
        else if (data.underlinedText && typeof passageContent === 'string' && passageContent.includes(data.underlinedText)) {
            const parts = passageContent.split(data.underlinedText);
            passageContent = (
                <>
                    {parts[0]}<u>{data.underlinedText}</u>{parts[1]}
                </>
            );
        }
    
        return <div className="question-passage">{passageContent}</div>;
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

    const renderTranslation = () => {
        const { questionNumber, translation } = questionData;

        if (['31', '32', '33', '34'].includes(questionNumber) && translation && translation.includes('__ANSWER__')) {
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
    
    const vocabLimit = ['30', '39'].includes(questionData.questionNumber) ? 15 : 35;

    return (
        <div className="analysis-sheet">
            <div className="preview-header">
                <span className="title">{displayTitle}</span>
                <span className="info">학번 ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ) 이름 ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</span>
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
                    <div className="explanation-block">{renderTranslation()}</div>
                    <p className="answer-text">정답: {questionData.answer}</p>
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
                {logoUrl && <img src={logoUrl} alt="logo" className="logo-placeholder" />}
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

        // List of keys that are expected to be strings
        const stringKeys: (keyof QuestionData)[] = [
            'questionNumber', 'prompt', 'promptEnglishPart', 'passage',
            'starredVocabulary', 'underlinedText', 'boxedText',
            'mainTextAfterBox', 'summaryPrompt', 'summaryBoxText', 'answer', 'translation'
        ];

        stringKeys.forEach(key => {
            const value = question[key];
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
        } else if (question.choices) {
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
    });

    return data as { [key: string]: QuestionData };
}

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
    
                    const basePrompt = `You are an expert AI assistant specializing in analyzing English exam questions. Your task is to extract specific information from the provided exam paper PDF and solution sheet PDF for the requested question numbers.

                    For each question number, you must extract the following information and format it as a single JSON object. The entire output must be a single JSON object where keys are the question numbers and values are the analysis for each question.
                    
                    **For ALL questions, provide:**
                    - questionNumber: The question number as a string.
                    - prompt: The full question prompt text.
                    - answer: The correct choice number (e.g., "①", "②") or the word/phrase answer, extracted from the solution sheet.
                    - translation: A natural Korean translation of the entire passage and prompt.
                    - vocabulary: A list of up to 35 important English words/phrases from the passage, with their Korean meanings. Format as {word: "...", meaning: "..."}.

                    **Question-Type Specific Instructions:**

                    *   **Q18-20, 22-24 (Purpose, Opinion, Topic, Title, etc.):**
                        *   passage: The full passage text.
                        *   choices: An array of the 5 choices.

                    *   **Q21 (Underlined Meaning):**
                        *   passage: The full passage text.
                        *   underlinedText: The specific text that is underlined in the passage.
                        *   promptEnglishPart: The English part of the prompt that is also underlined.
                        *   choices: An array of the 5 choices.

                    *   **Q29 (Contextual Vocabulary), Q30 (Reference):**
                        *   passage: The full passage with markers like ①, ②, etc. Replace the original underlined text with __1__text__1__, __2__text__2__ format.
                    
                    *   **Q31-34 (Blank Filling):**
                        *   passage: The full passage, with the main blank represented by a long underscore (at least 5 underscores).
                        *   choices: An array of the 5 choices.
                        *   For the translation, wrap the Korean equivalent of the answer in __ANSWER__ markers. For example: "하늘이 __ANSWER__푸른__ANSWER__ 이유".

                    *   **Q35 (Irrelevant Sentence):**
                        *   passage: The full passage text. The passage itself contains sentences marked with ①, ②, etc. The goal is to identify which sentence is irrelevant to the overall flow.

                    *   **Q38-39 (Sentence Insertion):**
                        *   boxedText: The text inside the box that needs to be inserted.
                        *   passage: The main passage text, including the numbered insertion points (e.g., ( ① ), ( ② )).
                    
                    *   **Q36-37 (Passage Ordering):**
                        *   boxedText: The initial passage in the box.
                        *   mainTextAfterBox: The passages labeled (A), (B), and (C).
                        *   choices: An array of the 5 ordering choices (e.g., "(A) - (C) - (B)").
                    
                    *   **Q40 (Summary Completion):**
                        *   passage: The main passage text.
                        *   summaryPrompt: The instruction text right before the summary box (e.g., "다음 글의 내용을 한 문장으로 요약하고자 한다...").
                        *   summaryBoxText: The text inside the summary box, including the (A) and (B) markers for blanks.
                        *   choices: An array of the 5 choices. Each choice text contains two parts separated by '....' or multiple spaces, for (A) and (B) respectively.

                    *   **General Note:** Some questions might have a "* 단어: 의미" section at the end. Extract this and include it as 'starredVocabulary'.

                    Please analyze the following question numbers: ${selectedQuestions.join(', ')}.
                    `;
    
                    const contents = {
                        parts: [
                            { text: basePrompt },
                            examPart,
                            ...(solutionPart ? [{ text: "\nHere is the solution sheet:" }, solutionPart] : [])
                        ]
                    };
    
                    setLoadingMessage('AI가 분석 중입니다... (1/2)');
                    const response = await ai.models.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: contents,
                        config: {
                            responseMimeType: "application/json",
                        }
                    });
    
                    if (isCancelledRef.current) return;
    
                    setLoadingMessage('결과를 처리 중입니다... (2/2)');
                    const jsonText = response.text.trim();
                    const parsedData = JSON.parse(jsonText);
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
        document.title = `${examTitle}_해설지.pdf`;
        document.body.classList.add('pdf-generating');
    
        // Let the DOM update before generating PDF
        await sleep(100);

        const element = previewRef.current;
        const opt = {
            margin: 0,
            filename: `${examTitle}_해설지.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'] }
        };
    
        await html2pdf().from(element).set(opt).save();
    
        document.body.classList.remove('pdf-generating');
        document.title = originalTitle;
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
                                {allowedQuestions.map(q => <option key={q} value={q}>{q}번</option>)}
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
                             <button className="btn-primary" onClick={handleDownload}>
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
                                    logoFile={logoFile}
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