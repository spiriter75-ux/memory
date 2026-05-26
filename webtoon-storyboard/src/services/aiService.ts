import { GoogleGenerativeAI, type Schema, SchemaType } from '@google/generative-ai';
import { useAppStore } from '../store/useAppStore';

const panelSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    panelNumber: {
      type: SchemaType.INTEGER,
      description: 'The number of the panel/cut in sequence (e.g., 1, 2, 3...)',
    },
    sceneDescription: {
      type: SchemaType.STRING,
      description: 'Korean. Detailed description of the situation, background, characters\' actions and expressions.',
    },
    imagePrompt: {
      type: SchemaType.STRING,
      description: 'English. Extremely detailed Stable Diffusion/Midjourney style diffusion prompt for image generation. Include character appearance, clothing, background, lighting, and camera angle. Use comma-separated keywords.',
    },
    narration: {
      type: SchemaType.STRING,
      description: 'Korean. The narration or character inner thoughts for this panel. Leave empty if none.',
    },
    dialogue: {
      type: SchemaType.STRING,
      description: 'Korean. The spoken dialogue of characters in this panel. Leave empty if none.',
    },
  },
  required: ['panelNumber', 'sceneDescription', 'imagePrompt', 'narration', 'dialogue'],
};

const outputSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    title: {
      type: SchemaType.STRING,
      description: 'Korean. Title of the storyboard or episode.'
    },
    characters: {
      type: SchemaType.ARRAY,
      description: 'List of main characters appearing in this storyboard text.',
      items: {
        type: SchemaType.STRING
      }
    },
    panels: {
      type: SchemaType.ARRAY,
      items: panelSchema,
      description: 'List of storyboard panels ordered by panelNumber.'
    }
  },
  required: ['title', 'characters', 'panels'],
};

export async function generateStoryboard(text: string, onUpdate?: (msg: string) => void) {
  const { characters, locations, objects, settings } = useAppStore.getState();
  const provider = settings.aiProvider || 'gemini';
  
  if (provider === 'gemini' && !settings.apiKey) {
    throw new Error('Google Gemini API Key is missing. Please set it in Settings.');
  }
  
  onUpdate?.('Building Context prompt with Series Bible...');
  const bibleContext = `
--- SERIES BIBLE ---
Below are registered entities you MUST strictly maintain consistency with when generating the image prompt & descriptions.

[Characters]
${characters.map(c => `- ${c.name}: ${c.appearance} (LoRA Trigger: ${c.loraTrigger})`).join('\n') || 'No characters registered.'}

[Locations]
${locations.map(l => `- ${l.name}: ${l.description}`).join('\n') || 'No locations registered.'}

[Objects/Items]
${objects.map(o => `- ${o.name}: ${o.description}`).join('\n') || 'No objects registered.'}
--------------------
`;

  const systemInstructions = `
당신은 전문 웹툰 스토리보드 작가입니다. 주어진 소설/시나리오 텍스트를 분석하여 웹툰 제작을 위한 상세 스토리보드(콘티)를 JSON 포맷으로 치밀하게 추출해야 합니다. 텍스트가 '슬라이드 목차' 형태일 경우 해당 구조를 엄격히 준수하세요.

[Constraints & Style Guide]
- Style Guide: ${settings.styleGuide}
- Global Constraints: ${settings.globalConstraints}
- Aspect Ratio: Base ratio is ${settings.aspectRatio}.

[Prompting Strategy for Z-Anime (S3-DiT Architecture)]
- Z-Anime performs best with **Natural Language Descriptions** (coherent sentences) rather than just keyword tags.
- Quality Tags: ${settings.qualityTags}
- Negative Prompt: ${settings.negativePrompt}
- Prompt Template: ${settings.promptTemplate}

[Learned Expertise (Dynamic Research Results)]
${settings.learningContext || '연구 결과가 아직 없습니다. 자가 학습을 통해 지식을 축적하세요.'}

[Series Bible Enforcement]
1. You MUST reference the characters, locations, and objects listed in the "SERIES BIBLE".
2. When creating the \`imagePrompt\` (in ENGLISH), follow the [Prompt Template] structure and use **Full Sentences** for placeholders.
3. Replace placeholders in the template:
   - [QualityTags]: Use the provided Quality Tags.
   - [Subject]: A descriptive sentence about the character's actions, pose, and expression.
   - [Appearance]: Descriptive sentences including character's LoRA trigger and appearance from the Bible.
   - [Background]: A vivid description of the environment/location.
   - [Lighting]: Atmospheric lighting description (e.g., "The scene is lit by soft, golden evening light").
   - [Style]: Artistic style description (e.g., "Modern high-budget anime movie style, sharp line art").
4. Do not include the negative prompt in the \`imagePrompt\` field.
5. Aim for clarity and compositional detail.
`.trim();

  const userPrompt = `
${bibleContext}

[Input Text]
${text}

Please generate the storyboard structured as per the provided JSON schema. Ensure Korean for descriptions, narration, dialogue, and English for the \`imagePrompt\`.
`;

  try {
    if (provider === 'gemini') {
      onUpdate?.('Initializing Gemini AI...');
      const genAI = new GoogleGenerativeAI(settings.apiKey);
      const model = genAI.getGenerativeModel({ model: settings.aiModel || 'gemini-2.5-flash' });
      
      onUpdate?.('Requesting AI to analyze text and extract storyboard panels (This might take a while)...');
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        systemInstruction: systemInstructions,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: outputSchema,
          temperature: 0.3,
        }
      });
      
      onUpdate?.('Parsing Gemini response...');
      const responseText = response.response.text();
      return JSON.parse(responseText);
      
    } else {
      // Ollama Provider - 꼬임 방지를 위한 정교한 처리
      const rawUrl = settings.ollamaUrl || 'http://localhost:11434';
      const url = rawUrl.replace(/\/+$/, ''); // 끝에 붙은 / 제거
      
      onUpdate?.(`Connecting to local Ollama (${url})...`);
      
      const payload = {
        model: settings.ollamaModel || 'llama3',
        prompt: userPrompt,
        system: systemInstructions + '\n\nIMPORTANT: Return ONLY valid JSON.',
        stream: false,
        format: 'json',
        options: {
          temperature: 0.3,
          num_ctx: 8192, // 모델의 전체 문맥 길이 (입력+출력) 확보
          num_predict: 8192 // 생성될 토큰의 최대 길이 확보
        }
      };

      try {
        const res = await fetch(`${url}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          // 로컬 연결이므로 타임아웃을 길게 설정
        });

        if (!res.ok) {
          let errorMsg = `Ollama 서버 응답 오류: ${res.status}`;
          try {
            const errorData = await res.json();
            if (errorData.error) {
              errorMsg += ` - ${errorData.error}`;
            }
          } catch(e) {
            // JSON 파싱 실패시 무시
          }
          throw new Error(errorMsg);
        }

        const data = await res.json();
        let textResponse = data.response || '';
        
        // 로컬 LLM이 JSON 앞뒤에 불필요한 설명("Here is the json:" 등)을 붙이는 경우를 대비해
        // 첫 번째 '{' 와 마지막 '}' 사이의 문자열만 추출
        const startIndex = textResponse.indexOf('{');
        const endIndex = textResponse.lastIndexOf('}');
        
        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
          textResponse = textResponse.substring(startIndex, endIndex + 1);
        } else {
          // 중괄호를 못 찾았을 때를 대비한 기본 마크다운 제거
          textResponse = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        }
        
        try {
          return JSON.parse(textResponse);
        } catch (parseErr: any) {
          console.error("JSON 파싱 에러. 원본 텍스트:", textResponse);
          throw new Error("Ollama가 생성한 데이터를 처리할 수 없습니다. (JSON 형식 오류)");
        }
      } catch (err: any) {
        if (err.message.includes('Failed to fetch')) {
          throw new Error('Ollama 서버에 연결할 수 없습니다. 서버가 실행 중인지, CORS 설정(OLLAMA_ORIGINS="*")이 되어 있는지 확인해 주세요.');
        }
        throw err;
      }
    }
  } catch (err: any) {
    console.error('AI Generation Error:', err);
    throw new Error(err.message || 'Failed to generate storyboard.');
  }
}
