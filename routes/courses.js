const express = require('express');
const router = express.Router();
const db = require('../config/database');

// ===== COURSE MANAGEMENT =====

// Get all courses for a tenant
router.get('/tenant/:tenantId/courses', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const result = await db.query(
            'SELECT * FROM courses WHERE tenant_id = $1 ORDER BY created_at DESC',
            [tenantId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Get courses error:', error);
        res.status(500).json({ error: 'Failed to fetch courses' });
    }
});

// Create a new course
router.post('/tenant/:tenantId/courses', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const { title, description, passing_score } = req.body;

        const result = await db.query(
            `INSERT INTO courses (tenant_id, title, description, passing_score) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
            [tenantId, title, description, passing_score || 70]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create course error:', error);
        res.status(500).json({ error: 'Failed to create course' });
    }
});

// Get single course with items
router.get('/courses/:courseId', async (req, res) => {
    try {
        const { courseId } = req.params;

        const courseResult = await db.query(
            'SELECT * FROM courses WHERE id = $1',
            [courseId]
        );

        if (courseResult.rows.length === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }

        const itemsResult = await db.query(
            'SELECT * FROM course_items WHERE course_id = $1 ORDER BY item_order',
            [courseId]
        );

        res.json({
            ...courseResult.rows[0],
            items: itemsResult.rows
        });
    } catch (error) {
        console.error('Get course error:', error);
        res.status(500).json({ error: 'Failed to fetch course' });
    }
});

// Update a course
router.put('/courses/:courseId', async (req, res) => {
    try {
        const { courseId } = req.params;
        const { title, description, passing_score } = req.body;

        const result = await db.query(
            `UPDATE courses 
       SET title = $1, description = $2, passing_score = $3
       WHERE id = $4
       RETURNING *`,
            [title, description, passing_score, courseId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Update course error:', error);
        res.status(500).json({ error: 'Failed to update course' });
    }
});

// Delete a course
router.delete('/courses/:courseId', async (req, res) => {
    try {
        const { courseId } = req.params;

        // First delete related items (if no CASCADE on DB)
        await db.query('DELETE FROM course_items WHERE course_id = $1', [courseId]);
        await db.query('DELETE FROM enrollments WHERE course_id = $1', [courseId]);

        // Then delete course
        const result = await db.query(
            'DELETE FROM courses WHERE id = $1 RETURNING id',
            [courseId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }

        res.json({ success: true, message: 'Course deleted successfully' });
    } catch (error) {
        console.error('Delete course error:', error);
        res.status(500).json({ error: 'Failed to delete course' });
    }
});

// Add content item to course
router.post('/courses/:courseId/items', async (req, res) => {
    try {
        const { courseId } = req.params;
        const { type, title, content_url, metadata, required, item_order } = req.body;

        // Get tenant_id from course for security
        const courseCheck = await db.query(
            'SELECT tenant_id FROM courses WHERE id = $1',
            [courseId]
        );

        if (courseCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }

        const tenantId = courseCheck.rows[0].tenant_id;

        // Determine order if not provided
        let order = item_order;
        if (order === undefined) {
            const maxOrder = await db.oneOrNone(
                'SELECT MAX(item_order) as max_order FROM course_items WHERE course_id = $1',
                [courseId]
            );
            order = (maxOrder?.max_order || 0) + 1;
        }

        const result = await db.query(
            `INSERT INTO course_items (course_id, tenant_id, item_order, type, title, content_url, metadata, required) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [courseId, tenantId, order, type, title, content_url, metadata, required !== false]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Add course item error:', error);
        res.status(500).json({ error: 'Failed to add course item' });
    }
});

module.exports = router;
