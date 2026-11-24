import { FunctionCallingConfigMode, GoogleGenAI, type FunctionDeclaration } from "@google/genai";
import readline from 'node:readline';

const client = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});

//TODO::: Adding a bash tool, readfile, writeFile,
//TODO:: 1.streaming, 2.web_search(fire), 3.create_sub_agent(depth-4)

const getWeather = async (city: string) => {
    const res1 = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);

    const data: any = await res1.json();
    const place = data.result?.[0]

    if (!place) throw new Error("Could not find the weather.");

    const res2 = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m`);

    const data2: any = await res2.json();

    console.log(`${city}:${data2.temperature_2m}°C`);
    return `${city}:${data2.temperature_2m}°C`;
}

const WeatherTool = {
    type: "function",
    name: 'get_weather',
    description: "Gets the current weather for a location.",
    parameters: {
        type: 'object',
        properties: {
            location: {
                type: 'string',
                description: "The city name, e.g. Mumbai",
            },
        },
        required: ['location'],
    },
} as const;

// const availableFunctions: Record<
//     "get_weather",
//     (args: WeatherArgs) => WeatherResult
// > = {
//     get_weather: ({ location }: WeatherArgs) => ({
//         location, temperature: "22", unit: "celsius"
//     }),
// };
// let interaction;


let previousId: string | undefined;

async function main() {

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const ip = rl.question("/nYou:");

    const response = await client.interactions.create({
        model: "gemini-3.1-flash-lite",
        input: ip,
        tools: [WeatherTool],
        ...(previousId ? { previous_interaction_id: previousId } : {}),
        // config: {
        //     tools: [{ functionDeclarations: [getWeather] }],
        //     automaticFunctionCalling: { disable: true },
        //     toolConfig: {
        //         functionCallingConfig: {
        //             mode: FunctionCallingConfigMode.ANY,
        //             allowedFunctionNames: ['get_weather'],
        //         }
        //     },
        // }

    });

    // const functionResults: FunctionResultInput[] = [];
    // for (const step of response.steps) {
    //     if (step.type === "function_call") {
    //         const result = availableFunctions[
    //             step.name as keyof typeof availableFunctions
    //         ](step.arguments as WeatherArgs);
    //         console.log(`Called ${step.name}(${JSON.stringify(step.arguments)}) →`, result);
    //         functionResults.push({
    //             type: "function_result",
    //             name: step.name,
    //             call_id: step.id,
    //             result: [{ type: "text", text: JSON.stringify(result) }],
    //         });
    //     }
    // }

    // if (functionResults.length === 0) {
    //     throw new Error("Expecting non-streaming response.");
    // };

    // input = functionResults;
    previousId = response.id;

    console.log(response.output_text);
}

main();

// this for openrouter
// if (!('output' in response)) {
//     throw new Error('Expected a non-streaming response');
// }
// if (response.status !== 'completed') {
//     throw new Error(response.error?.message ?? `Response ended as ${response.status}`);
// }

// const message = [...response.output].reverse().find((item) => item.type === 'message');
// console.log(message?.content.find((part) => part.type === 'output_text')?.text);
