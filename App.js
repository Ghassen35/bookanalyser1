import React, { useState, useEffect, useRef, useCallback } from "react";
// استيراد المكتبات والأيقونات اللازمة
import {
  FileUp,
  BookText,
  HelpCircle,
  MessageSquare,
  BrainCircuit,
  BotMessageSquare,
  Copy,
  RefreshCw,
  Flag,
  CheckCircle,
  XCircle,
  Loader2,
  X,
  Eye,
  AlertTriangle,
  Library,
  LayoutGrid,
  Save,
  LogIn,
  LogOut,
  Trash2,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

// --- (1) --- إعدادات Firebase ---
import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";

// إعدادات Firebase الخاصة بمشروعك
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: "books-ai-analyser.firebaseapp.com",
  projectId: "books-ai-analyser",
  storageBucket: "books-ai-analyser.appspot.com",
  messagingSenderId: "314397184348",
  appId: "1:314397184348:web:354465ddf7595fd0a6f199",
  measurementId: "G-VW9SG4W371",
};

// تهيئة وتشغيل خدمات Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// --- انتهى قسم إعدادات Firebase ---

// Helper to load scripts dynamically
const loadScript = (src) => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
};

// --- CSS in JS for animations and scrollbar ---
const StyleInjector = () => (
  <style>{`
    .animate-fadeIn { animation: fadeIn 0.5s ease-in-out; }
    .animate-modalShow { animation: modalShow 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes modalShow { from { opacity: 0; transform: scale(0.95) translateY(20px); } to { opacity: 1; transform: scale(1) translateY(0); } }
    .custom-scrollbar::-webkit-scrollbar { width: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #ccc; border-radius: 10px; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #aaa; }
    .prose h3 { color: #304F6D; }
    .prose p { margin-bottom: 1em; }
    .prose { white-space: pre-wrap; }
  `}</style>
);

// --- Main App Component ---
export default function App() {
  // --- State Management ---
  const [bookText, setBookText] = useState("");
  const [rawExtractedText, setRawExtractedText] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [activeModal, setActiveModal] = useState(null);
  const [quoteTopic, setQuoteTopic] = useState("");
  const [quotes, setQuotes] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [concepts, setConcepts] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isAiResponding, setIsAiResponding] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [chatContext, setChatContext] = useState("");
  const [pageImages, setPageImages] = useState([]);
  const [previewInfo, setPreviewInfo] = useState(null);
  const [ocrConfirmation, setOcrConfirmation] = useState(false);
  const [isTextReady, setIsTextReady] = useState(false);
  const [sectionSelectionConfig, setSectionSelectionConfig] = useState(null);
  const [user, setUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [savedAnalyses, setSavedAnalyses] = useState([]);
  const [currentAnalysisId, setCurrentAnalysisId] = useState(null);

  const fileInputRef = useRef(null);

  const colors = {
    primary: "#304F6D",
    secondary: "#b98e63",
    accent: "#ddc1a3",
    lightBg: "#f8f9fa",
    textPrimary: "#212529",
    textSecondary: "#6c757d",
  };

  // --- Effects ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setShowAuthModal(false);
        loadSavedAnalyses(currentUser.uid);
      } else {
        resetState();
        setSavedAnalyses([]);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    document.title = "محلل الكتب الذكي";
    toast.loading("جاري تحميل المكتبات الأساسية...", { duration: 2000 });
    loadScript(
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.min.js"
    ).then(() => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js";
      }
    });
    loadScript("https://unpkg.com/mammoth@1.6.0/mammoth.browser.min.js");
    loadScript(
      "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"
    );
  }, []);

  // --- API Call ---
  const callGeminiAPI = useCallback(async (prompt, isJson = false) => {
    const apiKey = process.env.REACT_APP_GEMINI_API_KEY; // <-- ضع مفتاح API الخاص بك هنا
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      ...(isJson && {
        generationConfig: { responseMimeType: "application/json" },
      }),
    };

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(
          `API Error: ${response.status} ${errorBody.error.message}`
        );
      }
      const result = await response.json();
      if (!result.candidates || result.candidates.length === 0) {
        throw new Error("No response from AI.");
      }
      const content = result.candidates[0].content.parts[0].text;
      return content;
    } catch (error) {
      toast.error(
        `حدث خطأ أثناء التواصل مع الذكاء الاصطناعي: ${error.message}`
      );
      throw error;
    }
  }, []);

  // --- State and File Handling ---
  const resetState = () => {
    setBookText("");
    setRawExtractedText("");
    setBookTitle("");
    setQuotes([]);
    setQuestions([]);
    setConcepts("");
    setChatHistory([]);
    setPageImages([]);
    setOcrConfirmation(false);
    setIsTextReady(false);
    setChatContext("");
    setCurrentAnalysisId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    resetState();
    setIsLoading(true);
    setLoadingMessage("جاري قراءة الملف...");
    setProgress(0);
    setBookTitle(file.name);

    try {
      if (file.type === "application/pdf") {
        await processPdf(file);
      } else if (file.name.endsWith(".docx")) {
        await processDocx(file);
      } else {
        throw new Error("صيغة الملف غير مدعومة. الرجاء رفع ملف PDF أو DOCX.");
      }
    } catch (error) {
      console.error(error);
      toast.error(error.message, { duration: 6000 });
      resetState();
    } finally {
      setIsLoading(false);
    }
  };

  const processPdf = async (file) => {
    if (!window.pdfjsLib)
      throw new Error("مكتبة تحليل PDF لم يتم تحميلها بعد.");

    const fileReader = new FileReader();
    fileReader.readAsArrayBuffer(file);

    await new Promise((resolve, reject) => {
      fileReader.onload = async (e) => {
        try {
          const pdf = await window.pdfjsLib.getDocument({
            data: e.target.result,
          }).promise;
          const numPages = pdf.numPages;
          let fullText = "";
          let tempPageImages = [];
          let extractedChars = 0;

          for (let i = 1; i <= numPages; i++) {
            const baseProgress = Math.round(((i - 1) / numPages) * 100);
            setLoadingMessage(`جاري فحص وتصوير الصفحة ${i} من ${numPages}...`);
            setProgress(baseProgress);

            const page = await pdf.getPage(i);

            const textContentPromise = page.getTextContent();
            const imageRenderingPromise = (async () => {
              const viewport = page.getViewport({ scale: 1.5 });
              const canvas = document.createElement("canvas");
              const context = canvas.getContext("2d");
              canvas.height = viewport.height;
              canvas.width = viewport.width;
              await page.render({ canvasContext: context, viewport: viewport })
                .promise;
              return canvas.toDataURL("image/jpeg");
            })();

            const [textContent, pageImage] = await Promise.all([
              textContentPromise,
              imageRenderingPromise,
            ]);

            tempPageImages.push(pageImage);

            const pageText = textContent.items
              .map((item) => item.str)
              .join(" ");
            extractedChars += pageText.replace(/\s/g, "").length;
            fullText += `\n\n--- PAGE_NUMBER_METADATA: ${i} ---\n\n` + pageText;
          }

          setRawExtractedText(fullText);
          setPageImages(tempPageImages);

          if (extractedChars < numPages * 20) {
            setLoadingMessage("الفحص الأولي اكتمل. يتطلب تأكيد.");
            setProgress(100);
            setOcrConfirmation(true);
          } else {
            setBookText(fullText);
            setIsTextReady(true);
            toast.success("تم تحليل الكتاب بنجاح!");
          }
          resolve();
        } catch (err) {
          reject(err);
        }
      };
    });
  };

  const processDocx = async (file) => {
    if (!window.mammoth) throw new Error("مكتبة قراءة DOCX لم يتم تحميلها.");
    setLoadingMessage("جاري تحليل ملف DOCX...");
    setProgress(20);
    const arrayBuffer = await file.arrayBuffer();
    setProgress(50);
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    setProgress(100);
    setBookText(result.value);
    setRawExtractedText(result.value);
    setIsTextReady(true);
    toast.success("تم تحليل الكتاب بنجاح!");
  };

  const runFullOcr = async () => {
    setOcrConfirmation(false);
    setIsLoading(true);

    if (pageImages.length === 0) {
      toast.error(
        "حدث خطأ: لم يتم العثور على صور الصفحات. الرجاء إعادة رفع الملف."
      );
      setIsLoading(false);
      return;
    }

    try {
      if (!window.Tesseract) throw new Error("مكتبة OCR لم يتم تحميلها.");
      const worker = await Tesseract.createWorker("ara", 1);
      let fullText = "";
      for (let i = 0; i < pageImages.length; i++) {
        const overallProgress = Math.round((i / pageImages.length) * 100);
        setLoadingMessage(
          `جاري القراءة الضوئية للصفحة ${i + 1} من ${pageImages.length}...`
        );
        setProgress(overallProgress);
        const {
          data: { text },
        } = await worker.recognize(pageImages[i]);
        fullText += `\n\n--- PAGE_NUMBER_METADATA: ${i + 1} ---\n\n` + text;
      }
      await worker.terminate();

      setBookText(fullText);
      setRawExtractedText(fullText);
      setIsTextReady(true);
      toast.success("اكتملت القراءة الضوئية بنجاح!");
    } catch (error) {
      toast.error(`فشلت عملية القراءة الضوئية: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinueWithRawText = () => {
    setOcrConfirmation(false);
    setBookText(rawExtractedText);
    setIsTextReady(true);
    toast.success("تم المتابعة بالنص المستخرج أولياً.");
  };

  // --- AI Analysis Functions ---
  const runAnalysis = async (analysisConfig, context) => {
    setIsLoading(true);
    setActiveModal(analysisConfig.modal);
    analysisConfig.resultSetter(analysisConfig.isJson ? [] : "");

    let progressInterval = null;

    try {
      setLoadingMessage(analysisConfig.loadingMsg);
      setProgress(0);

      progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev < 95) return prev + 1;
          clearInterval(progressInterval);
          return prev;
        });
      }, 150);

      const finalPrompt = analysisConfig.promptGenerator(context);
      const response = await callGeminiAPI(finalPrompt, analysisConfig.isJson);

      clearInterval(progressInterval);
      setProgress(100);
      setLoadingMessage("اكتمل التحليل!");

      if (analysisConfig.isJson) {
        let cleanedResponse = response.trim();
        if (cleanedResponse.startsWith("```json")) {
          cleanedResponse = cleanedResponse
            .substring(7, cleanedResponse.length - 3)
            .trim();
        } else if (cleanedResponse.startsWith("```")) {
          cleanedResponse = cleanedResponse
            .substring(3, cleanedResponse.length - 3)
            .trim();
        }
        const parsedJson = JSON.parse(cleanedResponse);
        analysisConfig.resultSetter(parsedJson);
      } else {
        analysisConfig.resultSetter(response);
      }
    } catch (error) {
      if (progressInterval) clearInterval(progressInterval);
      console.error("Analysis Error:", error);
      setActiveModal(null);
    } finally {
      setTimeout(() => setIsLoading(false), 500);
    }
  };

  const handleSectionSelected = (section) => {
    if (!sectionSelectionConfig) return;
    const { analysisRunner } = sectionSelectionConfig;
    analysisRunner(bookText);
    setSectionSelectionConfig(null);
  };

  const triggerSectionSelection = (analysisRunner) => {
    if (bookText.length < 200000) {
      analysisRunner(bookText);
    } else {
      setSectionSelectionConfig({ analysisRunner });
    }
  };

  const handleGetQuotes = () => {
    const runner = (context) =>
      runAnalysis(
        {
          modal: "quotes",
          loadingMsg: "جاري البحث عن الاقتباسات...",
          resultSetter: setQuotes,
          isJson: true,
          promptGenerator: (ctx) =>
            `أنت خبير في استخراج الاقتباسات. النص التالي هو جزء من كتاب. قواعد صارمة: 1. اللغة: يجب أن يكون نص الاقتباس ('quote') بنفس لغة النص الأصلي. لا تترجم. 2. الموضوع: "${
              quoteTopic.trim() ? quoteTopic : "مواضيع عامة ومؤثرة"
            }" 3. التنسيق: ابحث عن 5 إلى 10 اقتباسات. حدد رقم الصفحة إن وجد. النص: --- ${ctx} --- الناتج: صيغة JSON فقط، مصفوفة كائنات تحتوي على "quote", "speaker", و "page".`,
        },
        context
      );
    triggerSectionSelection(runner);
  };

  const handleGetQuestions = () => {
    const runner = (context) => {
      setUserAnswers({});
      setCurrentQuestionIndex(0);
      runAnalysis(
        {
          modal: "quiz",
          loadingMsg: "جاري إنشاء الأسئلة...",
          resultSetter: setQuestions,
          isJson: true,
          promptGenerator: (ctx) =>
            `بناءً على النص التالي، قم بإنشاء 5 أسئلة متنوعة بصيغة الاختيار من متعدد (MCQ). قواعد صارمة: 1. التهريب: إذا كان نص السؤال أو الخيارات يحتوي على (")، يجب تهريبها بـ (\\"). النص: --- ${ctx} --- أجب بصيغة JSON فقط: [{"question": "...", "options": [...], "correctAnswerIndex": 0, "page": 1}]`,
        },
        context
      );
    };
    triggerSectionSelection(runner);
  };

  const handleGetConcepts = () => {
    const runner = (context) =>
      runAnalysis(
        {
          modal: "concepts",
          loadingMsg: "جاري شرح أهم المفاهيم...",
          resultSetter: setConcepts,
          isJson: false,
          promptGenerator: (ctx) =>
            `اشرح أهم 5 مفاهيم رئيسية وردت في النص التالي. قدم شرحاً موجزاً وواضحاً لكل مفهوم. النص: --- ${ctx} --- أجب بنص عادي.`,
        },
        context
      );
    triggerSectionSelection(runner);
  };

  const handleStartChat = () => {
    const runner = (context) => {
      setChatContext(context);
      setIsAiResponding(true);
      runAnalysis(
        {
          modal: "chat",
          loadingMsg: "جاري بدء المناقشة...",
          resultSetter: (firstQuestion) => {
            setChatHistory([{ role: "assistant", text: firstQuestion }]);
            setIsAiResponding(false);
          },
          isJson: false,
          promptGenerator: (ctx) =>
            `أنت مدرس خبير. ستبدأ حواراً مع المستخدم حول هذا الجزء من كتاب. مهمتك هي أن تبدأ الحوار بطرح سؤال افتتاحي مثير للاهتمام. ابدأ بالسؤال مباشرة. الجزء من الكتاب: --- ${ctx} ---`,
        },
        context
      );
    };
    triggerSectionSelection(runner);
  };

  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || isAiResponding) return;
    const newHistory = [...chatHistory, { role: "user", text: chatInput }];
    setChatHistory(newHistory);
    setChatInput("");
    setIsAiResponding(true);
    const conversationPrompt = `أنت مدرس خبير ومناقش بارع، وتناقش المستخدم حول كتاب. هذا هو السياق من الكتاب الذي يدور حوله نقاشنا: --- ${chatContext} --- وهذا هو سجل المحادثة حتى الآن: ${newHistory
      .map((m) => `${m.role === "user" ? "المستخدم" : "أنت"}: ${m.text}`)
      .join(
        "\n"
      )} --- مهمتك: الرد على رسالة المستخدم الأخيرة، واختتم ردك دائماً بسؤال جديد للمتابعة.`;
    try {
      const response = await callGeminiAPI(conversationPrompt);
      setChatHistory((prev) => [
        ...prev,
        { role: "assistant", text: response },
      ]);
    } catch (error) {
      setChatHistory((prev) => [
        ...prev,
        { role: "assistant", text: "عذراً، حدث خطأ ما." },
      ]);
    } finally {
      setIsAiResponding(false);
    }
  };

  const handleShowPreview = (quote) => {
    const pageNumMatch = rawExtractedText
      .substring(0, rawExtractedText.indexOf(quote.quote))
      .match(/--- PAGE_NUMBER_METADATA: (\d+) ---/g);
    const pageNum = pageNumMatch
      ? parseInt(pageNumMatch.pop().match(/(\d+)/)[0])
      : null;

    if (
      pageImages.length === 0 ||
      !pageNum ||
      pageNum < 1 ||
      pageNum > pageImages.length
    ) {
      toast.error("بيانات المعاينة لهذه الصفحة غير متوفرة.");
      return;
    }
    setPreviewInfo({
      pageImage: pageImages[pageNum - 1],
      pageNum: pageNum,
    });
  };

  const closeModal = () => {
    setActiveModal(null);
  };

  const handleAnswerSelect = (questionIndex, answerIndex) => {
    setUserAnswers((prev) => ({ ...prev, [questionIndex]: answerIndex }));
  };

  // --- Firestore Functions ---
  const saveAnalysisToFirestore = async () => {
    if (!user) {
      toast.error("يجب تسجيل الدخول أولاً لحفظ التحليل.");
      setShowAuthModal(true);
      return;
    }
    if (!bookText) {
      toast.error("لا يوجد محتوى لحفظه.");
      return;
    }

    setIsLoading(true);
    setLoadingMessage("جاري حفظ التحليل في مكتبتك...");

    const analysisData = {
      title: bookTitle || "بدون عنوان",
      fullText: bookText,
      quotes: quotes || [],
      questions: questions || [],
      concepts: concepts || "",
      chatHistory: chatHistory || [],
      createdAt: serverTimestamp(),
      userId: user.uid,
    };

    try {
      if (currentAnalysisId) {
        const docRef = doc(db, "analyzedTexts", currentAnalysisId);
        await updateDoc(docRef, analysisData);
        toast.success("تم تحديث التحليل بنجاح!");
      } else {
        const docRef = await addDoc(
          collection(db, "analyzedTexts"),
          analysisData
        );
        setCurrentAnalysisId(docRef.id);
        toast.success("تم حفظ التحليل في مكتبتك بنجاح!");
      }
      loadSavedAnalyses(user.uid);
    } catch (e) {
      console.error("Error saving document: ", e);
      toast.error("فشل حفظ التحليل.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadSavedAnalyses = async (uid) => {
    if (!uid) return;
    const q = query(
      collection(db, "analyzedTexts"),
      where("userId", "==", uid)
    );
    const querySnapshot = await getDocs(q);
    const analyses = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const sortedAnalyses = analyses.sort((a, b) => {
      const dateA = a.createdAt?.toDate() || 0;
      const dateB = b.createdAt?.toDate() || 0;
      return dateB - dateA;
    });

    setSavedAnalyses(sortedAnalyses);
  };

  const handleDeleteAnalysis = async (analysisId) => {
    if (!window.confirm("هل أنت متأكد من رغبتك في حذف هذا التحليل نهائياً؟"))
      return;
    try {
      await deleteDoc(doc(db, "analyzedTexts", analysisId));
      toast.success("تم حذف التحليل.");
      setSavedAnalyses((prev) => prev.filter((a) => a.id !== analysisId));
      if (currentAnalysisId === analysisId) {
        resetState();
      }
    } catch (e) {
      toast.error("فشل حذف التحليل.");
      console.error("Error deleting document: ", e);
    }
  };

  const handleLoadAnalysis = (analysis) => {
    resetState();
    setBookTitle(analysis.title);
    setBookText(analysis.fullText);
    setRawExtractedText(analysis.fullText);
    setQuotes(analysis.quotes || []);
    setQuestions(analysis.questions || []);
    setConcepts(analysis.concepts || "");
    setChatHistory(analysis.chatHistory || []);
    setCurrentAnalysisId(analysis.id);
    setIsTextReady(true);
    setActiveModal(null);
    toast.success(`تم تحميل "${analysis.title}"`);
  };

  return (
    <>
      <StyleInjector />
      <div
        dir="rtl"
        className="min-h-screen flex flex-col"
        style={{
          backgroundColor: colors.lightBg,
          color: colors.textPrimary,
          fontFamily: "'Tajawal', sans-serif",
        }}
      >
        <link
          href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <Toaster
          position="bottom-center"
          toastOptions={{
            className: "font-[Tajawal] text-sm",
            style: { background: colors.primary, color: "white" },
          }}
        />

        <header
          className="p-4 shadow-md sticky top-0 bg-white/80 backdrop-blur-sm z-20"
          style={{ backgroundColor: colors.primary }}
        >
          <div className="container mx-auto flex justify-between items-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              محلل الكتب الذكي
            </h1>
            <div className="flex items-center gap-2 sm:gap-4">
              {user ? (
                <>
                  <button
                    onClick={() => setActiveModal("library")}
                    className="flex items-center gap-2 text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
                  >
                    <Library size={20} />
                    <span className="hidden sm:inline">مكتبتي</span>
                  </button>
                  <button
                    onClick={() => signOut(auth)}
                    className="flex items-center gap-2 text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
                  >
                    <LogOut size={20} />
                    <span className="hidden sm:inline">خروج</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="flex items-center gap-2 text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
                >
                  <LogIn size={20} />
                  <span>تسجيل الدخول</span>
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="flex-grow container mx-auto p-4 sm:p-8 flex flex-col items-center">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".pdf,.docx"
            className="hidden"
          />

          <div className="w-full max-w-4xl bg-white p-6 sm:p-8 rounded-2xl shadow-lg border">
            {!isTextReady && !isLoading && !ocrConfirmation && (
              <div className="text-center mb-8">
                <button
                  onClick={() => {
                    if (!user) {
                      toast.error("الرجاء تسجيل الدخول أولاً.");
                      setShowAuthModal(true);
                      return;
                    }
                    fileInputRef.current && fileInputRef.current.click();
                  }}
                  className="inline-flex items-center justify-center gap-3 px-10 py-5 rounded-xl text-white font-bold text-xl shadow-lg"
                  style={{
                    background: `linear-gradient(145deg, ${colors.primary}, ${colors.secondary})`,
                  }}
                >
                  <FileUp size={32} />
                  <span>ابدأ برفع كتاب</span>
                </button>
                <p
                  className="text-sm mt-3"
                  style={{ color: colors.textSecondary }}
                >
                  أو قم بتحميل تحليل سابق من{" "}
                  <button
                    onClick={() =>
                      user ? setActiveModal("library") : setShowAuthModal(true)
                    }
                    className="text-blue-600 hover:underline"
                  >
                    مكتبتك
                  </button>
                </p>
              </div>
            )}

            {isLoading && (
              <ProgressBar
                message={loadingMessage}
                progress={progress}
                colors={colors}
              />
            )}

            {ocrConfirmation && (
              <OcrConfirmationModal
                onConfirm={runFullOcr}
                onDeny={handleContinueWithRawText}
                rawTextSnippet={rawExtractedText.substring(0, 500)}
                colors={colors}
              />
            )}

            {isTextReady && !isLoading && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-green-600">
                      الكتاب المحمل: {bookTitle}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      fileInputRef.current.value = "";
                      resetState();
                    }}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    تحليل كتاب جديد
                  </button>
                </div>

                <button
                  onClick={saveAnalysisToFirestore}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-white font-semibold shadow-md transition-all transform hover:scale-105"
                  style={{
                    backgroundColor: currentAnalysisId
                      ? "#4CAF50"
                      : colors.primary,
                  }}
                >
                  <Save size={20} />
                  {currentAnalysisId
                    ? "تحديث النسخة المحفوظة"
                    : "حفظ التحليل في مكتبتي"}
                </button>

                <div
                  className="p-4 border rounded-lg"
                  style={{
                    borderColor: colors.secondary,
                    background: `${colors.accent}1A`,
                  }}
                >
                  <h3
                    className="font-bold mb-3 text-lg"
                    style={{ color: colors.primary }}
                  >
                    <BookText className="inline-block ml-2" />
                    اقتبس لي
                  </h3>
                  <input
                    type="text"
                    value={quoteTopic}
                    onChange={(e) => setQuoteTopic(e.target.value)}
                    placeholder="أدخل موضوعاً (اختياري)..."
                    className="w-full p-2.5 border rounded-md"
                  />
                  <button
                    onClick={handleGetQuotes}
                    className="w-full mt-3 px-6 py-2.5 rounded-lg text-white font-semibold"
                    style={{ backgroundColor: colors.secondary }}
                  >
                    استخراج الاقتباسات
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <ActionButton
                    icon={HelpCircle}
                    text="استخرج لي أسئلة"
                    onClick={handleGetQuestions}
                    colors={colors}
                  />
                  <ActionButton
                    icon={BrainCircuit}
                    text="اشرح أهم المفاهيم"
                    onClick={handleGetConcepts}
                    colors={colors}
                  />
                  <ActionButton
                    icon={MessageSquare}
                    text="ناقشني في الكتاب"
                    onClick={handleStartChat}
                    colors={colors}
                  />
                </div>
              </div>
            )}
          </div>
        </main>

        <footer
          className="text-center p-4 mt-auto"
          style={{ color: colors.textSecondary }}
        >
          <p className="text-sm">
            برمجه بالذكاء الاصطناعي غسان محمد نويرة , 1447 هـ - 2025 م
          </p>
        </footer>

        {sectionSelectionConfig && (
          <SectionSelectionModal
            onSelect={handleSectionSelected}
            onClose={() => setSectionSelectionConfig(null)}
            colors={colors}
          />
        )}

        {activeModal &&
          activeModal !== "view_raw_text" &&
          activeModal !== "library" && (
            <ResultsModal
              onClose={closeModal}
              title={getModalTitle(activeModal)}
              colors={colors}
            >
              {isLoading ? (
                <ProgressBar
                  message={loadingMessage}
                  progress={progress}
                  colors={colors}
                />
              ) : (
                <>
                  {activeModal === "quotes" && (
                    <QuotesView
                      quotes={quotes}
                      colors={colors}
                      onShowPreview={handleShowPreview}
                      isPdf={pageImages.length > 0}
                    />
                  )}
                  {activeModal === "quiz" && (
                    <QuizView
                      questions={questions}
                      colors={colors}
                      currentQuestionIndex={currentQuestionIndex}
                      setCurrentQuestionIndex={setCurrentQuestionIndex}
                      userAnswers={userAnswers}
                      onAnswerSelect={handleAnswerSelect}
                      onRegenerate={() =>
                        triggerSectionSelection(handleGetQuestions)
                      }
                    />
                  )}
                  {activeModal === "concepts" && (
                    <ConceptsView concepts={concepts} />
                  )}
                  {activeModal === "chat" && (
                    <ChatView
                      history={chatHistory}
                      input={chatInput}
                      onInputChange={setChatInput}
                      onSend={handleSendChatMessage}
                      isResponding={isAiResponding}
                      colors={colors}
                    />
                  )}
                </>
              )}
            </ResultsModal>
          )}

        {activeModal === "view_raw_text" && (
          <ResultsModal
            onClose={closeModal}
            title="النص المستخرج من الملف"
            colors={colors}
          >
            <div className="bg-gray-100 p-4 rounded-md max-h-[60vh] overflow-y-auto custom-scrollbar">
              <pre className="whitespace-pre-wrap text-sm">
                {rawExtractedText || "لا يوجد نص لعرضه."}
              </pre>
            </div>
          </ResultsModal>
        )}

        {previewInfo && (
          <PreviewModal
            previewInfo={previewInfo}
            onClose={() => setPreviewInfo(null)}
            colors={colors}
          />
        )}

        {showAuthModal && (
          <AuthModal onClose={() => setShowAuthModal(false)} colors={colors} />
        )}

        {activeModal === "library" && (
          <LibraryModal
            analyses={savedAnalyses}
            onLoad={handleLoadAnalysis}
            onDelete={handleDeleteAnalysis}
            onClose={() => setActiveModal(null)}
            colors={colors}
          />
        )}
      </div>
    </>
  );
}

// --- Helper Components ---
const ProgressBar = ({ message, progress, colors }) => (
  <div className="w-full text-center my-8 px-4">
    <p className="text-lg mb-3" style={{ color: colors.primary }}>
      {message}
    </p>
    <div
      className="w-full bg-gray-200 rounded-full h-4 overflow-hidden"
      style={{ direction: "ltr" }}
    >
      <div
        className="h-4 rounded-full transition-all duration-300 ease-linear"
        style={{ width: `${progress}%`, backgroundColor: colors.secondary }}
      ></div>
    </div>
    <p className="mt-2 text-xl font-semibold" style={{ color: colors.primary }}>
      {Math.round(progress)}%
    </p>
  </div>
);

const ActionButton = ({ icon: Icon, text, onClick, colors }) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center justify-center gap-3 p-6 rounded-lg text-white font-semibold shadow-md transition-all transform hover:scale-105"
    style={{ backgroundColor: colors.primary }}
  >
    <Icon size={28} />
    <span>{text}</span>
  </button>
);

const getModalTitle = (modalType) => {
  switch (modalType) {
    case "quotes":
      return "اقتباسات من الكتاب";
    case "quiz":
      return "اختبر فهمك للكتاب";
    case "concepts":
      return "أهم المفاهيم في الكتاب";
    case "chat":
      return "مناقشة حول الكتاب";
    default:
      return "النتائج";
  }
};

const ResultsModal = ({ children, title, onClose, colors }) => {
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col animate-modalShow"
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="p-4 border-b flex justify-between items-center"
          style={{ borderColor: colors.accent }}
        >
          <h2 className="text-xl font-bold" style={{ color: colors.primary }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-200 transition-colors"
          >
            <X size={24} style={{ color: colors.textSecondary }} />
          </button>
        </header>
        <div className="p-6 overflow-y-auto custom-scrollbar">{children}</div>
      </div>
    </div>
  );
};

const SectionSelectionModal = ({ onSelect, onClose, colors }) => (
  <ResultsModal
    title="اختر جزء الكتاب للتحليل"
    onClose={onClose}
    colors={colors}
  >
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
      <button
        onClick={() => onSelect("q1")}
        className="p-6 text-lg font-semibold border rounded-lg hover:bg-gray-100 transition-all"
      >
        الربع الأول (0-25%)
      </button>
      <button
        onClick={() => onSelect("q2")}
        className="p-6 text-lg font-semibold border rounded-lg hover:bg-gray-100 transition-all"
      >
        الربع الثاني (25-50%)
      </button>
      <button
        onClick={() => onSelect("q3")}
        className="p-6 text-lg font-semibold border rounded-lg hover:bg-gray-100 transition-all"
      >
        الربع الثالث (50-75%)
      </button>
      <button
        onClick={() => onSelect("q4")}
        className="p-6 text-lg font-semibold border rounded-lg hover:bg-gray-100 transition-all"
      >
        الربع الأخير (75-100%)
      </button>
      <button
        onClick={() => onSelect("full_sampled")}
        className="md:col-span-2 p-6 text-lg font-semibold border rounded-lg hover:bg-gray-100 transition-all flex items-center justify-center gap-2"
        style={{ backgroundColor: `${colors.accent}33` }}
      >
        <LayoutGrid />
        الكتاب كامل (نظرة عامة شاملة)
      </button>
    </div>
  </ResultsModal>
);

const OcrConfirmationModal = ({
  onConfirm,
  onDeny,
  rawTextSnippet,
  colors,
}) => (
  <div className="text-center p-4 animate-fadeIn">
    <AlertTriangle size={48} className="mx-auto text-yellow-500" />
    <h2 className="text-xl font-bold mt-4" style={{ color: colors.primary }}>
      فشل استخراج النص المباشر
    </h2>
    <p className="mt-2 text-gray-600">
      يبدو أن ملف الـ PDF المرفوع هو صورة ممسوحة ضوئياً. النص المستخرج يبدو غير
      صحيح:
    </p>
    <div className="mt-4 p-3 bg-gray-100 border rounded-md max-h-28 overflow-y-auto text-left text-xs text-gray-500 font-mono">
      {rawTextSnippet}...
    </div>
    <p className="mt-4 text-gray-600">
      هل ترغب في تشغيل **القراءة الضوئية (OCR)**؟ هذه العملية أبطأ ولكنها تستخرج
      النص بدقة من الصور.
    </p>
    <div className="mt-6 flex justify-center gap-4">
      <button
        onClick={onConfirm}
        className="px-6 py-2 rounded-lg text-white font-semibold shadow-lg"
        style={{ backgroundColor: colors.primary }}
      >
        نعم، شغل القراءة الضوئية (موصى به)
      </button>
      <button
        onClick={onDeny}
        className="px-6 py-2 rounded-lg font-semibold border"
        style={{ color: colors.textSecondary, borderColor: colors.accent }}
      >
        لا، تابع بالنص الحالي
      </button>
    </div>
  </div>
);

const QuotesView = ({ quotes, colors, onShowPreview, isPdf }) => {
  const handleCopy = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
    toast.success("تم نسخ الاقتباس!");
  };

  return (
    <div className="space-y-6">
      {quotes.length > 0 ? (
        quotes.map((q, i) => (
          <div
            key={i}
            className="p-4 border-r-4 rounded-r-lg relative"
            style={{
              borderColor: colors.secondary,
              backgroundColor: `${colors.accent}2A`,
            }}
          >
            <div className="absolute top-2 left-2 flex gap-1">
              {isPdf && q.page && (
                <button
                  onClick={() => onShowPreview(q)}
                  className="p-2 rounded-full hover:bg-gray-200"
                  title="معاينة الصفحة"
                >
                  <Eye size={18} style={{ color: colors.textSecondary }} />
                </button>
              )}
              <button
                onClick={() => handleCopy(`"${q.quote}"\n- ${q.speaker}`)}
                className="p-2 rounded-full hover:bg-gray-200"
                title="نسخ الاقتباس"
              >
                <Copy size={18} style={{ color: colors.textSecondary }} />
              </button>
            </div>
            <blockquote className="pr-8">
              <p
                className="text-lg italic"
                style={{ color: colors.textPrimary }}
              >
                "{q.quote}"
              </p>
              <footer
                className="mt-2 text-sm"
                style={{ color: colors.textSecondary }}
              >
                - {q.speaker}
                {q.page ? `, صفحة ${q.page}` : ""}
              </footer>
            </blockquote>
          </div>
        ))
      ) : (
        <p>لم يتم العثور على اقتباسات مطابقة للموضوع المحدد.</p>
      )}
    </div>
  );
};

const PreviewModal = ({ previewInfo, onClose, colors }) => {
  const { pageImage, pageNum } = previewInfo;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col animate-modalShow"
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="p-2 border-b flex justify-between items-center"
          style={{ borderColor: colors.accent }}
        >
          <h2 className="text-lg font-bold" style={{ color: colors.primary }}>
            معاينة صفحة رقم {pageNum}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-200 transition-colors"
          >
            <X size={20} style={{ color: colors.textSecondary }} />
          </button>
        </header>
        <div className="p-4 overflow-auto custom-scrollbar flex-grow flex items-center justify-center bg-gray-100 relative">
          <div className="relative inline-block">
            <img
              src={pageImage}
              alt={`معاينة صفحة ${pageNum}`}
              className="max-w-full max-h-full object-contain shadow-lg"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const ConceptsView = ({ concepts }) => (
  <div
    className="prose max-w-none"
    dangerouslySetInnerHTML={{ __html: concepts.replace(/\n/g, "<br />") }}
  />
);

const QuizView = ({
  questions,
  colors,
  currentQuestionIndex,
  setCurrentQuestionIndex,
  userAnswers,
  onAnswerSelect,
  onRegenerate,
}) => {
  if (!questions || questions.length === 0) return <p>فشل إنشاء الأسئلة.</p>;
  const question = questions[currentQuestionIndex];
  if (!question) return null;
  const userAnswer = userAnswers[currentQuestionIndex];
  const isAnswered = userAnswer !== undefined;

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-bold text-lg" style={{ color: colors.primary }}>
          السؤال {currentQuestionIndex + 1} من {questions.length}
        </h3>
        {question.page && (
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            من صفحة {question.page}
          </p>
        )}
      </div>
      <p className="text-xl mb-4 p-2">{question.question}</p>

      <div className="space-y-3">
        {question.options.map((option, index) => {
          const isCorrect = index === question.correctAnswerIndex;
          let buttonClass = "border-gray-300 hover:bg-gray-100";
          if (isAnswered) {
            buttonClass = isCorrect
              ? "bg-green-100 border-green-500"
              : userAnswer === index
              ? "bg-red-100 border-red-500"
              : "border-gray-300";
          }
          return (
            <button
              key={index}
              disabled={isAnswered}
              onClick={() => onAnswerSelect(currentQuestionIndex, index)}
              className={`w-full text-right p-3 border rounded-lg ${buttonClass}`}
            >
              <span className="font-semibold">
                {String.fromCharCode(1575 + index)})
              </span>{" "}
              {option}
              {isAnswered && isCorrect && (
                <CheckCircle className="inline-block mr-2 text-green-600" />
              )}
              {isAnswered && !isCorrect && userAnswer === index && (
                <XCircle className="inline-block mr-2 text-red-600" />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex justify-between items-center">
        <button
          onClick={() =>
            setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))
          }
          disabled={currentQuestionIndex === 0}
          className="px-4 py-2 rounded-md disabled:opacity-50"
          style={{ backgroundColor: colors.accent }}
        >
          السابق
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              toast("سيتم إضافة هذه الميزة قريباً!", { icon: "🚩" })
            }
            className="p-2 rounded-full hover:bg-red-100"
            title="الإبلاغ عن سؤال"
          >
            <Flag size={18} className="text-red-500" />
          </button>
          <button
            onClick={onRegenerate}
            className="p-2 rounded-full hover:bg-blue-100"
            title="إعادة توليد الأسئلة"
          >
            <RefreshCw size={18} className="text-blue-500" />
          </button>
        </div>
        <button
          onClick={() =>
            setCurrentQuestionIndex((prev) =>
              Math.min(questions.length - 1, prev + 1)
            )
          }
          disabled={currentQuestionIndex === questions.length - 1}
          className="px-4 py-2 rounded-md disabled:opacity-50"
          style={{ backgroundColor: colors.accent }}
        >
          التالي
        </button>
      </div>
    </div>
  );
};

const ChatView = ({
  history,
  input,
  onInputChange,
  onSend,
  isResponding,
  colors,
}) => {
  const chatEndRef = useRef(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);
  return (
    <div className="flex flex-col h-[65vh]">
      <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar space-y-4">
        {history.map((msg, index) => (
          <div
            key={index}
            className={`flex items-start gap-3 ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {msg.role === "assistant" && (
              <BotMessageSquare
                size={24}
                className="flex-shrink-0 mt-1"
                style={{ color: colors.primary }}
              />
            )}
            <div
              className={`max-w-md p-3 rounded-2xl ${
                msg.role === "user"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              <p className="text-sm">{msg.text}</p>
            </div>
          </div>
        ))}
        {isResponding && (
          <div className="flex items-start gap-3 justify-start">
            <BotMessageSquare
              size={24}
              className="flex-shrink-0 mt-1"
              style={{ color: colors.primary }}
            />
            <div className="p-3 rounded-2xl bg-gray-100">
              <Loader2 className="animate-spin" />
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      <div
        className="mt-4 pt-4 border-t"
        style={{ borderColor: colors.accent }}
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && onSend()}
            placeholder="اكتب ردك هنا..."
            className="flex-grow p-2 border rounded-lg"
            disabled={isResponding}
          />
          <button
            onClick={onSend}
            disabled={isResponding || !input}
            className="px-4 py-2 rounded-lg text-white font-semibold"
            style={{ backgroundColor: colors.secondary }}
          >
            إرسال
          </button>
        </div>
      </div>
    </div>
  );
};

const AuthModal = ({ onClose, colors }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      onClose();
    } catch (err) {
      setError(
        err.message.includes("auth/invalid-credential")
          ? "البريد الإلكتروني أو كلمة المرور غير صحيحة."
          : "حدث خطأ ما. حاول مرة أخرى."
      );
      console.error(err.code, err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResultsModal
      title={isLogin ? "تسجيل الدخول" : "إنشاء حساب جديد"}
      onClose={onClose}
      colors={colors}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="البريد الإلكتروني"
          required
          className="w-full p-3 border rounded-lg"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="كلمة المرور"
          required
          className="w-full p-3 border rounded-lg"
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full p-3 rounded-lg text-white font-semibold"
          style={{ backgroundColor: colors.primary }}
        >
          {loading ? (
            <Loader2 className="animate-spin mx-auto" />
          ) : isLogin ? (
            "دخول"
          ) : (
            "إنشاء حساب"
          )}
        </button>
        <p className="text-center text-sm">
          {isLogin ? "ليس لديك حساب؟" : "لديك حساب بالفعل؟"}
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-blue-600 hover:underline mr-1"
          >
            {isLogin ? "أنشئ واحداً" : "سجل دخول"}
          </button>
        </p>
      </form>
    </ResultsModal>
  );
};

const LibraryModal = ({ analyses, onLoad, onDelete, onClose, colors }) => {
  return (
    <ResultsModal
      title="مكتبتي: التحليلات المحفوظة"
      onClose={onClose}
      colors={colors}
    >
      <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
        {analyses && analyses.length > 0 ? (
          analyses.map((analysis) => (
            <div
              key={analysis.id}
              className="p-4 border rounded-lg flex justify-between items-center hover:bg-gray-50"
            >
              <div>
                <h3
                  className="font-bold text-lg"
                  style={{ color: colors.primary }}
                >
                  {analysis.title}
                </h3>
                <p className="text-sm text-gray-500">
                  تاريخ الإنشاء:{" "}
                  {analysis.createdAt?.toDate().toLocaleDateString("ar-EG") ||
                    "غير معروف"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onLoad(analysis)}
                  className="p-2 rounded-lg text-white"
                  style={{ backgroundColor: colors.secondary }}
                  title="تحميل التحليل"
                >
                  <BookText size={20} />
                </button>
                <button
                  onClick={() => onDelete(analysis.id)}
                  className="p-2 rounded-lg bg-red-500 text-white"
                  title="حذف التحليل"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="text-center text-gray-500 p-8">
            مكتبتك فارغة. قم برفع كتاب وتحليله لحفظه هنا.
          </p>
        )}
      </div>
    </ResultsModal>
  );
};
