const express = require("express");
const Category = require("../models/Category");
const Contact = require("../models/Contact");

const router = express.Router();

// Get all categories
router.get("/", async (req, res) => {
    try {
        const categories = await Category.find().sort({ createdAt: -1 });
        res.json({ success: true, categories });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new category
router.post("/", async (req, res) => {
    try {
        const { name, description, color, filters } = req.body;
        
        const category = new Category({
            name,
            description,
            color,
            filters: filters || {}
        });

        await category.save();
        
        // Update contact count
        await updateCategoryContactCount(category._id);
        
        res.json({ success: true, category });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get category with contacts
router.get("/:id/contacts", async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ error: "Category not found" });
        }

        const contacts = await Contact.find(buildFilterQuery(category.filters));
        
        res.json({ 
            success: true, 
            category, 
            contacts,
            totalContacts: contacts.length 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update category
router.put("/:id", async (req, res) => {
    try {
        const { name, description, color, filters } = req.body;
        
        const category = await Category.findByIdAndUpdate(
            req.params.id,
            { 
                name, 
                description, 
                color, 
                filters,
                updatedAt: new Date()
            },
            { new: true }
        );

        if (!category) {
            return res.status(404).json({ error: "Category not found" });
        }

        // Update contact count
        await updateCategoryContactCount(category._id);
        
        res.json({ success: true, category });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete category
router.delete("/:id", async (req, res) => {
    try {
        const category = await Category.findByIdAndDelete(req.params.id);
        if (!category) {
            return res.status(404).json({ error: "Category not found" });
        }
        
        res.json({ success: true, message: "Category deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get category statistics
router.get("/:id/stats", async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ error: "Category not found" });
        }

        const contacts = await Contact.find(buildFilterQuery(category.filters));
        
        const stats = {
            totalContacts: contacts.length,
            activeContacts: contacts.filter(c => c.status === 'active').length,
            totalMessages: contacts.reduce((sum, contact) => sum + (contact.messageCount || 0), 0),
            locations: [...new Set(contacts.map(c => c.location).filter(Boolean))],
            businessTypes: [...new Set(contacts.map(c => c.businessType).filter(Boolean))]
        };

        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper function to build filter query
function buildFilterQuery(filters) {
    const query = {};
    
    if (filters.businessType && filters.businessType.length > 0) {
        query.businessType = { $in: filters.businessType };
    }
    
    if (filters.location && filters.location.length > 0) {
        query.location = { $in: filters.location };
    }
    
    if (filters.status) {
        query.status = filters.status;
    }
    
    if (filters.minMessages !== undefined) {
        query.messageCount = { $gte: filters.minMessages };
    }
    
    if (filters.maxMessages !== undefined) {
        if (query.messageCount) {
            query.messageCount.$lte = filters.maxMessages;
        } else {
            query.messageCount = { $lte: filters.maxMessages };
        }
    }
    
    if (filters.lastContacted && filters.lastContacted.from) {
        query.lastContacted = { $gte: new Date(filters.lastContacted.from) };
        
        if (filters.lastContacted.to) {
            query.lastContacted.$lte = new Date(filters.lastContacted.to);
        }
    }
    
    return query;
}

// Helper function to update contact count
async function updateCategoryContactCount(categoryId) {
    const category = await Category.findById(categoryId);
    if (!category) return;
    
    const contactCount = await Contact.countDocuments(buildFilterQuery(category.filters));
    category.contactCount = contactCount;
    await category.save();
}

module.exports = router;
