import { FunctionCallingConfigMode, GoogleGenAI, type FunctionDeclaration, type GoogleGenAIInteraction } from "@google/genai";
import axios from "axios";

const client = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});

//TODO: Adding a bash tool, readfile, writeFile,
//TODO: 3.create_sub_agent(depth-4)

const webSearch = async (query: string, limit: number) => {
    try {
        const apiKey = process.env.FIRECRAWL_API_KEY!;

        if (!apiKey) {
            throw new Error("Firecrawl api key is missing.");
        }

        const response = await axios.post("https://api.firecrawl.dev/v2/search",
            { query, limit },
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
            },
        );

        console.log(response.data);
        return response.data;

    } catch (error: unknown) {
        throw new Error("Internal server error.");
    }
}

const getWeather = async (city: string) => {
    try {
        const response1 = await axios.get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);

        const data: any = response1.data;
        const place = data.results?.[0]

        if (!place) throw new Error("Could not find the weather.");

        const response2 = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m`);

        const data2: any = response2.data;

        console.log(`${city}: ${data2.current?.temperature_2m}°C`);
        return `${city}: ${data2.current?.temperature_2m}°C`;
    } catch (error: unknown) {
        throw new Error("Internal server error.");
    }
}

const WeatherTool = {
    type: "function",
    name: "get_weather",
    description: "Gets the current weather for a location.",
    parameters: {
        type: "object",
        properties: {
            location: {
                type: "string",
                description: "The city name, e.g. Mumbai",
            },
        },
        required: ["location"],
    },
} as const;


const webSearchTool = {
    type: "function",
    name: "web_search",
    description: "Search the web for current information.",
    parameters: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "The web search query.",
            },
            limit: {
                type: "number",
                minimum: 1,
                maximum: 10,
                description: "Maximum number of results to return.",
            }
        },
        required: ["query", "limit"],
        additionalProperties: true,
    },
} as const;

async function main() {

    // let interaction;
    let input: any = "what is microscopic?";
    let previousId: string | undefined;

    while (true) {
        const stream1 = await client.interactions.create({
            model: "gemini-3.1-flash-lite",
            input,
            tools: [WeatherTool, webSearchTool],
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
            stream: true,
            generation_config: {
                tool_choice: "any",
                thinking_summaries: "auto"
            },
        });

        //stream
        let streamResult = {
            firstInteractionId: "string",
            funcCallId: "string",
            funcCallName: "string",
            funcArgsAccumulated: "",
        }

        for await (const event of stream1) {
            if (event.event_type === "interaction.created") {
                streamResult.firstInteractionId = event.interaction.id;
            } else if (event.event_type === "step.start") {
                const step = event.step;
                if (step.type === "function_call") {
                    streamResult.funcCallId = step.id;
                    streamResult.funcCallName = step.name;
                }
            } else if (event.event_type === "step.delta") {
                if (event.delta.type === "arguments_delta") {
                    streamResult.funcArgsAccumulated += event.delta.arguments;
                }
            }
        }

        // const functionResults: {
        //     type: "function_result";
        //     name: string;
        //     call_id: string;
        //     result: {
        //         type: "text";
        //         text: string;
        //     }[];
        // }[] = [];

        const functionResults = [];
        if (!streamResult.funcCallId && !streamResult.firstInteractionId && !streamResult.funcCallName) {
            process.stdout.write("\n");
            break;
        }
        const stream2 = await client.interactions.create({
            model: "gemini-3.1-flash-lite",
            previous_interaction_id: streamResult.firstInteractionId,
            input,
            stream: true,
        });

        let result: unknown;

        const args = JSON.parse(streamResult.funcArgsAccumulated) as Record<string, unknown>;

        // const args1 = JSON.parse(streamResult.funcArgsAccumulated) as {
        //     location: string,
        // };

        if (streamResult.funcCallName == "get_weather") {
            const location = String(args.location || "");
            if (!location) {
                throw new Error("Location is missing for weather");
            }

            result = await getWeather(location);
        }

        if (streamResult.funcCallName == "web_search") {
            const query = String(args.query || "");
            const limit = Number(args.limit || 5);

            if (!query && !limit) {
                throw new Error("query and limit is missing for web search");
            }

            result = await webSearch(query, limit);
        }
        
        // const result1 = await getWeather(args1.location);

        // const args2 = JSON.parse(streamResult.funcArgsAccumulated) as {
        //     query: string,
        //     limit: number
        // };

        // const result2 = await webSearch(args2.query, args2.limit);

        // console.log(`Called ${streamResult.funcCallName}(${JSON.stringify(args1)}) →`, result1);
        console.log(`Called ${streamResult.funcCallName}(${JSON.stringify(args)}) →`, result);

        functionResults.push({
            type: "function_result",
            name: streamResult.funcCallName,
            call_id: streamResult.funcCallId,
            result: [{ type: "text", text: JSON.stringify(result) }],
        });

        for await (const event of stream2) {
            if (event.event_type === "step.delta") {
                if (event.delta.type === "text") {
                    // console.log(event.delta.text)
                    process.stdout.write(event.delta.text);
                }
            }
        }
        input = functionResults;
        previousId = streamResult.firstInteractionId;
    }

}
main().catch(error => console.log(error));

// this for openrouter
// if (!('output' in response)) {
//     throw new Error('Expected a non-streaming response');
// }
// if (response.status !== 'completed') {
//     throw new Error(response.error?.message ?? `Response ended as ${response.status}`);
// }

// const message = [...response.output].reverse().find((item) => item.type === 'message');
// console.log(message?.content.find((part) => part.type === 'output_text')?.text);
