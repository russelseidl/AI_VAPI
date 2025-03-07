import { VapiClient } from "@vapi-ai/server-sdk";

export const vapiClient = new VapiClient({
    token: process.env.VAPI_API_TOKEN || "3c6e9d6f-dfce-4150-8876-7a52b49fb2b8",
});

/**
 * Fetches the details of a call by callId.
 * @param callId - The unique call ID returned by VAPI upon call creation.
 */
export const getCallDetails = async (callId: string) => {
    try {
        const response = await vapiClient.calls.get(callId);
        return response;
    } catch (error) {
        console.error("Error fetching call details:", error);
        throw error;
    }
};

/**
 * Initiates a new VAPI call, passing in dynamic data such as customer name, order details, etc.
 * @param data - An object containing call parameters, such as:
 *  - customer_name: string
 *  - phone_number: string
 *  - store_name: string
 *  - order_number: string
 *  - order_items: string
 *  - vehicle_make: string
 *  - vehicle_model: string
 *  - vehicle_color: string
 */
export const makeCall = async (data: {
    customer_name: string;
    phone_number: string;
    store_name: string;
    order_number: string;
    order_items: string;
    vehicle_make: string;
    vehicle_model: string;
    vehicle_color: string;
}) => {
    try {
        // Create the call via the VapiClient
        const response = await vapiClient.calls.create({
            // Replace with your actual Assistant ID
            assistantId: process.env.VAPI_ASSISTANT_ID || "76bc3501-b67f-4fda-9f09-c7ad4ee07fa6",
            assistantOverrides: {
                variableValues: {
                    customer_name: data.customer_name,
                    store_name: data.store_name,
                    order_number: data.order_number,
                    order_items: data.order_items,
                    vehicle_make: data.vehicle_make,
                    vehicle_model: data.vehicle_model,
                    vehicle_color: data.vehicle_color,
                },
            },
            customer: {
                number: data.phone_number, // customer's phone number
            },
            // Autolane Twilio VAPI phone number ID
            phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID || "3a9a115d-a6fe-40f6-bed9-171cc0b4f267",
        });

        return response;
    } catch (error) {
        console.error("Error making VAPI call:", error);
        throw error;
    }
};