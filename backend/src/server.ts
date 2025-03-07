import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { query } from './database';
import { makeCall, getCallDetails } from './vapiClient';

const app: Application = express();
const port = 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// ----------------------------------------------------------------------------
// 1) SCHEDULING FUNCTION: Schedules a 5-minute follow-up to fetch call details
// ----------------------------------------------------------------------------
function scheduleGetCallDetails(callId: string, orderId: number) {
    // 5 minutes = 300,000 ms
    setTimeout(async () => {
        try {
            console.log(`\n[Schedule] Fetching call details for callId = ${callId}...`);
            const callDetails = await getCallDetails(callId);

            // Destructure the relevant fields, including 'analysis'
            const { analysis = null } = callDetails;
            const successEvaluation = analysis?.successEvaluation || null;

            // If you store other updated call info in "calls" or "orders", do it here:
            // Example if storing in orders table:
            if (successEvaluation) {
                await query(
                    `UPDATE orders
                     SET success_evaluation = $1
                     WHERE id = $2`,
                    [successEvaluation, orderId],
                );
                console.log(`[Schedule] Updated orderId = ${orderId} with success_evaluation = ${successEvaluation}`);
            }

            console.log(`[Schedule] Done updating callId = ${callId} / orderId = ${orderId}.\n`);
        } catch (error) {
            console.error(`[Schedule] Error fetching/updating call details for callId = ${callId}:`, error);
        }
    }, 300000);
}

// --------------------------------------------------------------------------
// 2) ROUTES
// --------------------------------------------------------------------------

// 2a) Fetch all orders
app.get('/api/orders', async (_req: Request, res: Response): Promise<void> => {
    try {
        const result = await query('SELECT * FROM orders ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Error fetching orders' });
    }
});

// 2b) Fetch all calls
app.get('/api/calls', async (_req: Request, res: Response): Promise<void> => {
    try {
        const result = await query('SELECT * FROM calls');
        console.log('Fetched calls from database:', result.rows);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching calls:', error);
        res.status(500).json({ error: 'Error fetching calls' });
    }
});

// 2c) Create a new order
app.post('/api/orders', async (req: Request, res: Response): Promise<void> => {
    const {
        customer_name,
        phone_number,
        vehicle_make,
        vehicle_model,
        vehicle_color,
        store_name,
        order_number,
        items,
    } = req.body;

    try {
        const result = await query(
            `INSERT INTO orders
             (customer_name, phone_number, vehicle_make, vehicle_model, vehicle_color,
              store_name, order_number, items)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING *`,
            [
                customer_name,
                phone_number,
                vehicle_make,
                vehicle_model,
                vehicle_color,
                store_name,
                order_number,
                items,
            ],
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ error: 'Error creating order' });
    }
});

// 2d) Delete an order
app.delete('/api/orders/:id', async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    try {
        await query('DELETE FROM orders WHERE id = $1', [id]);
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting order:', error);
        res.status(500).json({ error: 'Error deleting order' });
    }
});

// 2e) Initiate a call for a specific order
app.post('/api/call/:id', async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    try {
        const result = await query('SELECT * FROM orders WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            // The important fix: do not *return* the expression of res.json(...)
            // because that returns a Response, not void.
            res.status(404).json({ error: 'Order not found' });
            return;
        }

        const order = result.rows[0];

        // Make the call via VAPI
        const callResponse = await makeCall({
            customer_name: order.customer_name,
            phone_number: order.phone_number,
            store_name: order.store_name,
            order_number: order.order_number,
            order_items: order.items,
            vehicle_make: order.vehicle_make,
            vehicle_model: order.vehicle_model,
            vehicle_color: order.vehicle_color,
        });

        // Insert into calls table
        const {
            id: callId,
            assistantId = null,
            phoneNumberId = null,
            type = null,
            createdAt,
            updatedAt = null,
            orgId = null,
            cost = null,
            customer = null,
            status = null,
            phoneCallProvider = null,
            phoneCallProviderId = null,
            phoneCallTransport = null,
            assistantOverrides = null,
            monitor = null,
        } = callResponse;

        const formattedCost = cost !== null && cost !== undefined ? cost.toString() : '0.00';

        await query(
            `INSERT INTO calls
             (order_id, call_id, assistant_id, phone_number_id, type, created_at, updated_at,
              org_id, cost, customer_number, status, phone_call_provider, phone_call_provider_id,
              phone_call_transport, assistant_overrides, monitor_data)
             VALUES
                 ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
            [
                id,
                callId,
                assistantId,
                phoneNumberId,
                type,
                createdAt,
                updatedAt,
                orgId,
                formattedCost,
                customer?.number || null,
                status,
                phoneCallProvider,
                phoneCallProviderId,
                phoneCallTransport,
                JSON.stringify(assistantOverrides) || null,
                JSON.stringify(monitor) || null,
            ],
        );

        // Schedule the 5-minute follow-up
        scheduleGetCallDetails(callId, parseInt(id, 10));

        res.json({ message: 'Call initiated successfully', callId });
    } catch (error) {
        console.error('Error initiating call:', error);
        res.status(500).json({ error: 'Error initiating call' });
    }
});

// 2f) On-demand fetch of call details
app.get('/api/call-details/:callId', async (req: Request, res: Response): Promise<void> => {
    const { callId } = req.params;
    try {
        const callDetails = await getCallDetails(callId);
        console.log('Call Details:', callDetails);
        res.json(callDetails);
    } catch (error) {
        console.error('Error retrieving call details:', error);
        res.status(500).json({ error: 'Error retrieving call details' });
    }
});

// 2g) (Optional) fetch calls for a specific order
app.get('/api/orders/:id/calls', async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    try {
        const calls = await query('SELECT * FROM calls WHERE order_id = $1', [id]);
        res.json(calls.rows);
    } catch (error) {
        console.error('Error fetching calls:', error);
        res.status(500).json({ error: 'Error fetching calls' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Backend running at http://localhost:${port}`);
});
