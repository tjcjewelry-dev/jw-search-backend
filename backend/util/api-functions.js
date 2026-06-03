export const extractPublicImages = async (requestData) => {
    if (!requestData || requestData.length === 0) throw new Error("Data is missing");

    const fetchPromises = requestData.map(async (req) => {
        const response = await fetch(req.imageUrl);
        if (!response.ok) {
            throw new Error(`Server returned ${response.status} for ${req.imageUrl}`);
        }
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const buffer = await response.arrayBuffer();
        const base64String = await Buffer.from(buffer).toString('base64');
        const ext = req.imageUrl.split(".").pop().split("?")[0] || "jpg";

        return { id: req.id, imageUrl: req.imageUrl, ext, contentType, base64String };
    });

    return await Promise.all(fetchPromises);
}